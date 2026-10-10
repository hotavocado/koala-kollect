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
// Pass 2 alone takes most of Convex's 10-minute action limit, so run stops
// there: it records pass 2's results on the data_syncs row, leaves the row
// "running", and schedules retireChain. The chain retires in actions that each
// stop after RETIRE_BUDGET_MS and schedule the next, then rebuilds card_sets
// and closes the row "ok" (or "failed"). The chain is the only path to "ok".
//
// Run by hand: npx convex run dataSync:run '{"force": true}'
// It returns "running" once pass 2 is written; the data_syncs row has the end
// state once the chain finishes.

const DEFAULT_REPO = "hotavocado/koala-kollect-data";
const BATCH_SIZE = 200;
const UNPROXIED_KEYS_LISTED = 50;
const RETIRE_BATCH_SIZE = 20;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
// A sync row still "running" after this long is treated as dead, not live.
const RUNNING_TTL_MS = 30 * 60 * 1000;
// A retire chain invocation starts no batch after this long, leaving room
// under the 10-minute action limit for the batch in flight and the rebuild.
const RETIRE_BUDGET_MS = 5 * 60 * 1000;

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

// KK_RETIRE_BUDGET_MS can only shorten the budget (tests set 0: one batch per
// invocation), so a bad value never lets an invocation run past the limit.
function retireBudgetMs(): number {
  const ms = Number(process.env.KK_RETIRE_BUDGET_MS ?? NaN);
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, RETIRE_BUDGET_MS) : RETIRE_BUDGET_MS;
}

// The retired keys at a commit, read as pass 1 reads them and in the same
// order, so an offset names the same key in every chain invocation. Raw URLs
// at a SHA are immutable, so a manifest that no longer hashes to the one the
// sync verified is a fault, not new data.
async function retiredKeysAt(commit: string, manifestSha256: string): Promise<string[]> {
  const bytes = await fetchFile(commit, "manifest.json");
  if ((await sha256Hex(bytes)) !== manifestSha256) {
    throw new Refusal(`manifest.json at ${commit} no longer matches the sync's manifest_sha256`);
  }
  const keys: string[] = [];
  for (const [path, entry] of Object.entries(parseManifest(new TextDecoder().decode(bytes)).files)) {
    if (entry.type !== RETIRED_TYPE) continue;
    for (const key of retiredKeys(path, await verifyFile(path, await fetchFile(commit, path), entry))) keys.push(key);
  }
  return keys;
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
    const unproxied: Pick<Doc<"printings">, "key" | "site">[] = [];
    try {
      for (const [path, entry] of Object.entries(manifest.files)) {
        if (entry.type === RETIRED_TYPE) continue; // read in pass 1, applied by retireChain
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
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.dataSync.finish, { syncId, status: "failed", refusal: message, upserted });
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
    // The row stays "running": retireChain closes it. Scheduled even with
    // nothing to retire, so the rebuild and "ok" have one path. Its args are
    // the commit and an offset, never the keys, which it re-reads itself.
    try {
      await ctx.runMutation(internal.dataSync.progress, {
        syncId,
        upserted,
        unproxied_images: n,
        ...(n > 0 && { unproxied_image_keys: listed, unproxied_image_sites: sites }),
      });
      await ctx.scheduler.runAfter(0, internal.dataSync.retireChain, { commit, syncId, offset: 0 });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.dataSync.finish, { syncId, status: "failed", refusal: message, upserted });
      return { status: "failed", data_commit: commit, detail: message };
    }
    // "2 printing images not proxied (en 1, tcgcsv 1): prt_a, prt_b"
    const retiring = `retiring ${retired.length} listed ${retired.length === 1 ? "printing" : "printings"}`;
    let detail = `${upserted} rows inserted or updated; ${retiring} and rebuilding card_sets in the background (the data_syncs row has the end state); ${n} printing ${n === 1 ? "image" : "images"} not proxied`;
    if (n > 0) {
      const more = n > listed.length ? `, and ${n - listed.length} more` : "";
      detail += ` (${sites.map((s) => `${s.site} ${s.count}`).join(", ")}): ${listed.join(", ")}${more}`;
    }
    return { status: "running", data_commit: commit, detail };
  },
});

// Retires the keys from `offset` until RETIRE_BUDGET_MS has passed, then
// schedules itself from where it stopped; after the last key it rebuilds
// card_sets and closes the row "ok". Retires come after run's upserts, so a
// locator the same commit moved onto a surviving printing already points
// there. The retired file stays in the data repo, so every later sync re-reads
// it and finds nothing left to delete: a key already gone counts 0, which is
// also why a chain killed mid-batch is safe to run again.
export const retireChain = internalAction({
  args: { commit: v.string(), syncId: v.id("data_syncs"), offset: v.number() },
  handler: async (ctx, { commit, syncId, offset }): Promise<void> => {
    const started = Date.now();
    // A closed row (finished, failed, or abandoned by begin) means a duplicate
    // or late invocation: it does nothing.
    const row = await ctx.runQuery(internal.dataSync.syncRow, { syncId });
    if (row?.status !== "running") return;
    const before = row.retired ?? 0;
    let retired = 0;
    try {
      if (row.data_commit !== commit) throw new Error(`retireChain for ${commit} on a sync of ${row.data_commit}`);
      const keys = await retiredKeysAt(commit, row.manifest_sha256);
      const budget = retireBudgetMs();
      let at = offset;
      // At least one batch per invocation, so the chain always moves.
      while (at < keys.length && (at === offset || Date.now() - started < budget)) {
        retired += await ctx.runMutation(internal.dataSync.retireBatch, { keys: keys.slice(at, at + RETIRE_BATCH_SIZE), syncId });
        at += RETIRE_BATCH_SIZE;
      }
      if (at < keys.length) {
        await ctx.runMutation(internal.dataSync.progress, { syncId, retired: before + retired });
        await ctx.scheduler.runAfter(0, internal.dataSync.retireChain, { commit, syncId, offset: at });
        return;
      }
      // begin may have abandoned the row while the last batches ran. The
      // rebuild is not one transaction, so this is a check, not a fence; a
      // late rebuild only re-derives card_sets from the tables as they are.
      if ((await ctx.runQuery(internal.dataSync.syncRow, { syncId }))?.status !== "running") return;
      // Inside the try so a failed rebuild closes the sync "failed" and the
      // next run retries the commit; an "ok" commit is never revisited.
      await rebuildCardSets(ctx);
    } catch (e) {
      // Not rescheduled: the next run retries the whole commit.
      const message = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.dataSync.finish, { syncId, status: "failed", refusal: message, retired: before + retired });
      return;
    }
    await ctx.runMutation(internal.dataSync.finish, { syncId, status: "ok", retired: before + retired });
  },
});

export const syncRow = internalQuery({
  args: { syncId: v.id("data_syncs") },
  handler: async (ctx, { syncId }): Promise<Doc<"data_syncs"> | null> => await ctx.db.get(syncId),
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
    if (latest?.status === "running") {
      if (Date.now() - Date.parse(latest.started_at) < RUNNING_TTL_MS) return null;
      // An action killed at the time limit never reaches its catch. Close its
      // row so the table shows it failed rather than "running" forever.
      await ctx.db.patch(latest._id, {
        status: "failed",
        refusal: `abandoned: still running after ${RUNNING_TTL_MS / 60_000} min`,
        finished_at: nowIso(),
      });
    }
    return await ctx.db.insert("data_syncs", { ...args, status: "running" });
  },
});

// Records progress on a sync row without closing it: pass 2's results from
// run, and the running retired total from each retireChain invocation.
export const progress = internalMutation({
  args: {
    syncId: v.id("data_syncs"),
    upserted: v.optional(v.number()),
    retired: v.optional(v.number()),
    unproxied_images: v.optional(v.number()),
    unproxied_image_keys: v.optional(v.array(v.string())),
    unproxied_image_sites: v.optional(v.array(v.object({ site: printingSite, count: v.number() }))),
  },
  handler: async (ctx, { syncId, ...fields }) => {
    if ((await ctx.db.get(syncId))?.status !== "running") return;
    await ctx.db.patch(syncId, fields);
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
  // A closed row stays closed: a chain that outlived begin's TTL must not turn
  // the row begin abandoned back into "ok".
  handler: async (ctx, { syncId, ...fields }) => {
    if ((await ctx.db.get(syncId))?.status !== "running") return;
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
// deleted; a key already gone counts 0. Given a sync, it refuses unless that
// sync is still running, in the same transaction as the deletes, so a chain
// begin has abandoned stops at its next batch.
export const retireBatch = internalMutation({
  args: { keys: v.array(v.string()), syncId: v.optional(v.id("data_syncs")) },
  handler: async (ctx, { keys, syncId }) => {
    if (syncId !== undefined) {
      const status = (await ctx.db.get(syncId))?.status;
      if (status !== "running") throw new Error(`retire fenced: sync ${syncId} is ${status ?? "gone"}, not running`);
    }
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
