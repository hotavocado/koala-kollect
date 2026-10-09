import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { proxiedImageUrl } from "../app/cards/image";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { rebuildCardSets } from "./cardSets";
import { printingSite } from "./schema";
import {
  type Manifest,
  type SyncRecord,
  type SyncedTable,
  Refusal,
  RETIRED_TYPE,
  SYNCED_TABLES,
  TYPE_TO_TABLE,
  parseManifest,
  mainFromRefs,
  sameRecord,
  refuseMissingImage,
  retiredKeys,
  sha256Hex,
  verifyFile,
} from "./syncCore";

// Syncs the card tables from koala-kollect-data at one commit.
//
// Two passes. Pass 1 fetches every file in the manifest, checks sha256 and row
// count, and parses every line; any mismatch is a refusal recorded in
// data_syncs, and nothing is written. Pass 2 re-fetches each file at the same
// commit (raw URLs at a SHA are immutable, and the hash is checked again) and
// upserts by key in batches, so only one file is in memory at a time.
// Upserts never delete. The one delete is a printing the data repo lists in
// data/retired_printings.jsonl: after the upserts, it goes with every row on
// its exact key (product listings, claims, locators, links).
//
// Run by hand: npx convex run dataSync:run '{"force": true}'

const DEFAULT_REPO = "hotavocado/koala-kollect-data";
const BATCH_SIZE = 200;
const UNPROXIED_KEYS_LISTED = 50;
const RETIRE_BATCH_SIZE = 20;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
// A sync row still "running" after this long is treated as dead, not live.
const RUNNING_TTL_MS = 30 * 60 * 1000;

const syncedTable = v.union(...SYNCED_TABLES.map((t) => v.literal(t)));

function repo(): string {
  return process.env.KK_DATA_REPO ?? DEFAULT_REPO;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// GitHub rejects some requests that carry no User-Agent.
const GITHUB_HEADERS = { "User-Agent": "koala-kollect-sync" };

// Fetches a URL's whole body. Any failure, including one while the body is
// being read, becomes a Refusal naming what was fetched.
async function getBytes(url: string, what: string): Promise<ArrayBuffer> {
  try {
    const res = await fetch(url, { headers: GITHUB_HEADERS });
    if (!res.ok) {
      // The body is the only place GitHub says why (rate limit, abuse block).
      const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 120);
      throw new Refusal(`${what}: HTTP ${res.status}${body ? ` (${body})` : ""}`);
    }
    return await res.arrayBuffer();
  } catch (e) {
    if (e instanceof Refusal) throw e;
    throw new Refusal(`${what}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function latestCommit(): Promise<string> {
  const advert = await getBytes(`https://github.com/${repo()}.git/info/refs?service=git-upload-pack`, "data repo main");
  const sha = mainFromRefs(new TextDecoder().decode(advert));
  if (sha === null) throw new Refusal("data repo main: no refs/heads/main in the ref advertisement");
  return sha;
}

async function fetchFile(commit: string, path: string): Promise<ArrayBuffer> {
  return await getBytes(`https://raw.githubusercontent.com/${repo()}/${commit}/${path}`, path);
}

export const run = internalAction({
  args: { commit: v.optional(v.string()), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ status: string; data_commit?: string; detail?: string }> => {
    // Every outcome past this point, including not finding main, leaves a
    // data_syncs row, so a failing daily cron is visible in the table.
    let commit = args.commit ?? null;
    let fetchError: string | null = null;
    if (commit === null) {
      try {
        commit = await latestCommit();
      } catch (e) {
        if (!(e instanceof Refusal)) throw e;
        fetchError = e.message;
      }
    } else if (!COMMIT_SHA.test(commit)) {
      throw new Error(`not a commit SHA: ${commit}`);
    }

    if (commit !== null && !args.force) {
      const last = await ctx.runQuery(internal.dataSync.lastOk, {});
      if (last?.data_commit === commit) return { status: "skipped", data_commit: commit };
    }

    let manifestBytes: ArrayBuffer | null = null;
    if (commit !== null) {
      try {
        manifestBytes = await fetchFile(commit, "manifest.json");
      } catch (e) {
        if (!(e instanceof Refusal)) throw e;
        fetchError = e.message;
      }
    }

    const syncId = await ctx.runMutation(internal.dataSync.begin, {
      data_commit: commit ?? "",
      manifest_sha256: manifestBytes ? await sha256Hex(manifestBytes) : "",
      started_at: nowIso(),
    });
    if (syncId === null) return { status: "skipped", detail: "another sync is running" };

    // Pass 1: verify everything before writing anything.
    let manifest: Manifest;
    const retired: string[] = [];
    try {
      if (commit === null || manifestBytes === null) throw new Refusal(fetchError ?? "no manifest");
      manifest = parseManifest(new TextDecoder().decode(manifestBytes));
      const live = new Set<string>();
      const retiredAt: { path: string; line: number; key: string }[] = [];
      for (const [path, entry] of Object.entries(manifest.files)) {
        const records = await verifyFile(path, await fetchFile(commit, path), entry);
        if (entry.type === "printing") {
          refuseMissingImage(path, records);
          for (const r of records) live.add(r.key);
        } else if (entry.type === RETIRED_TYPE) {
          retiredKeys(path, records).forEach((key, i) => retiredAt.push({ path, line: i + 1, key }));
        }
      }
      for (const { path, line, key } of retiredAt) {
        if (live.has(key)) throw new Refusal(`${path} line ${line}: ${key} is retired and still a printing in this commit`);
        retired.push(key);
      }
    } catch (e) {
      // A Refusal is a contract violation; anything else is our failure. Either
      // way the row is closed, so it never sits "running" and blocks the next run.
      const refused = e instanceof Refusal;
      const message = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.dataSync.finish, {
        syncId,
        status: refused ? "refused" : "failed",
        refusal: message,
      });
      return { status: refused ? "refused" : "failed", data_commit: commit ?? undefined, detail: message };
    }

    // Pass 2: write. Each batch commits on its own, so a failure here leaves
    // the tables holding records from this commit and the one before. That is
    // accepted rather than staged: every record is keyed and valid on its own,
    // the row is closed "failed", and the next run retries this commit (only
    // an "ok" sync is skipped). Pass 1 has already proven the files, so what
    // remains is a network failure or a record the Convex schema rejects.
    let upserted = 0;
    let retiredCount = 0;
    const unproxied: Pick<Doc<"printings">, "key" | "site">[] = [];
    try {
      for (const [path, entry] of Object.entries(manifest.files)) {
        if (entry.type === RETIRED_TYPE) continue; // read in pass 1, applied below
        const records = await verifyFile(path, await fetchFile(commit, path), entry);
        const table = TYPE_TO_TABLE[entry.type];
        if (entry.type === "printing") {
          for (const r of records as Doc<"printings">[]) {
            // No image yet (tcgcsv only) is not an image the proxy refuses.
            if (r.image_url !== undefined && proxiedImageUrl(r.image_url) === null) {
              unproxied.push({ key: r.key, site: r.site });
            }
          }
        }
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
          const r = await ctx.runMutation(internal.dataSync.upsertBatch, {
            table,
            records: records.slice(i, i + BATCH_SIZE),
          });
          upserted += r.inserted + r.updated;
        }
      }
      // After the upserts, so a locator the same commit moved onto a surviving
      // printing already points there. The file stays in the data repo, so
      // every later sync re-reads it and finds nothing left to delete.
      for (let i = 0; i < retired.length; i += RETIRE_BATCH_SIZE) {
        retiredCount += await ctx.runMutation(internal.dataSync.retireBatch, { keys: retired.slice(i, i + RETIRE_BATCH_SIZE) });
      }
      // Inside the try so a failed rebuild closes the sync "failed" and the
      // next run retries the commit; an "ok" commit is never revisited.
      await rebuildCardSets(ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.dataSync.finish, { syncId, status: "failed", refusal: message, upserted, retired: retiredCount });
      return { status: "failed", data_commit: commit, detail: message };
    }

    // Split by site, on the row as well as in the detail (a cron run discards
    // the detail), so a site whose images are never proxied reads as a
    // constant and a site that changes its image path stands out.
    const n = unproxied.length;
    const keys = unproxied.map((u) => u.key).sort();
    const listed = keys.slice(0, UNPROXIED_KEYS_LISTED);
    const bySite = new Map<Doc<"printings">["site"], number>();
    for (const u of unproxied) bySite.set(u.site, (bySite.get(u.site) ?? 0) + 1);
    const sites = [...bySite].sort(([a], [b]) => a.localeCompare(b)).map(([site, count]) => ({ site, count }));
    await ctx.runMutation(internal.dataSync.finish, {
      syncId,
      status: "ok",
      upserted,
      retired: retiredCount,
      unproxied_images: n,
      ...(n > 0 && { unproxied_image_keys: listed, unproxied_image_sites: sites }),
    });
    // "2 printing images not proxied (en 1, tcgcsv 1): prt_a, prt_b"
    const retiredText = `${retiredCount} ${retiredCount === 1 ? "printing" : "printings"} retired`;
    let detail = `${upserted} rows inserted or updated, ${retiredText}; ${n} printing ${n === 1 ? "image" : "images"} not proxied`;
    if (n > 0) {
      const more = n > listed.length ? `, and ${n - listed.length} more` : "";
      detail += ` (${sites.map((s) => `${s.site} ${s.count}`).join(", ")}): ${listed.join(", ")}${more}`;
    }
    return { status: "ok", data_commit: commit, detail };
  },
});

export const lastOk = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"data_syncs"> | null> => {
    return await ctx.db
      .query("data_syncs")
      .withIndex("by_started_at")
      .order("desc")
      .filter((q) => q.eq(q.field("status"), "ok"))
      .first();
  },
});

// Opens a sync row, or returns null when a live sync is already running.
export const begin = internalMutation({
  args: { data_commit: v.string(), manifest_sha256: v.string(), started_at: v.string() },
  handler: async (ctx, args): Promise<Id<"data_syncs"> | null> => {
    const latest = await ctx.db.query("data_syncs").withIndex("by_started_at").order("desc").first();
    if (latest?.status === "running" && Date.now() - Date.parse(latest.started_at) < RUNNING_TTL_MS) {
      return null;
    }
    return await ctx.db.insert("data_syncs", { ...args, status: "running" });
  },
});

export const finish = internalMutation({
  args: {
    syncId: v.id("data_syncs"),
    status: v.union(v.literal("ok"), v.literal("refused"), v.literal("failed")),
    refusal: v.optional(v.string()),
    upserted: v.optional(v.number()),
    retired: v.optional(v.number()),
    unproxied_images: v.optional(v.number()),
    unproxied_image_keys: v.optional(v.array(v.string())),
    unproxied_image_sites: v.optional(v.array(v.object({ site: printingSite, count: v.number() }))),
  },
  handler: async (ctx, { syncId, ...fields }) => {
    await ctx.db.patch(syncId, { ...fields, finished_at: nowIso() });
  },
});

// Upserts one batch by key. Unchanged records are not rewritten. A record that
// breaks the table's schema throws here, failing the batch and the sync.
export const upsertBatch = internalMutation({
  args: { table: syncedTable, records: v.array(v.any()) },
  handler: async (ctx, { table, records }) => {
    let inserted = 0;
    let updated = 0;
    for (const record of records as SyncRecord[]) {
      const existing = await byKey(ctx.db, table, record.key);
      if (existing === null) {
        await ctx.db.insert(table, record as never);
        inserted++;
      } else if (!sameRecord(existing, record)) {
        await ctx.db.replace(existing._id, record as never);
        updated++;
      }
    }
    return { inserted, updated };
  },
});

// Deletes each retired printing and every row on its exact key, through the
// by_printing indexes (eq, never a prefix range). Returns the printings
// deleted; a key already gone counts 0.
export const retireBatch = internalMutation({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    let deleted = 0;
    for (const key of keys) {
      const printing = await ctx.db.query("printings").withIndex("by_key", (q) => q.eq("key", key)).unique();
      if (printing !== null) {
        await ctx.db.delete(printing._id);
        deleted++;
      }
      const rows = [
        ...(await ctx.db.query("printing_products").withIndex("by_printing", (q) => q.eq("printing_key", key)).collect()),
        ...(await ctx.db.query("printing_distributions").withIndex("by_printing", (q) => q.eq("printing_key", key)).collect()),
        ...(await ctx.db.query("printing_locators").withIndex("by_printing", (q) => q.eq("printing_key", key)).collect()),
        ...(await ctx.db.query("printing_links").withIndex("by_printing_a", (q) => q.eq("printing_a", key)).collect()),
        ...(await ctx.db.query("printing_links").withIndex("by_printing_b", (q) => q.eq("printing_b", key)).collect()),
      ];
      for (const row of rows) await ctx.db.delete(row._id);
    }
    return deleted;
  },
});

// Every synced table has a by_key index. TypeScript cannot follow an index
// name across a union of tables, so the lookup is typed loosely here.
type AnyDoc = { _id: Id<SyncedTable> } & Record<string, unknown>;
async function byKey(
  db: { query: (table: SyncedTable) => unknown },
  table: SyncedTable,
  key: string,
): Promise<AnyDoc | null> {
  const q = db.query(table) as {
    withIndex: (
      name: "by_key",
      range: (q: { eq: (field: "key", value: string) => unknown }) => unknown,
    ) => { unique: () => Promise<AnyDoc | null> };
  };
  return await q.withIndex("by_key", (r) => r.eq("key", key)).unique();
}
