/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import fixture from "./fixtures/contract-valid.jsonl?raw";
import schema from "./schema";
import { type RecordType, SYNCED_TABLES, TYPE_TO_TABLE, sha256Hex } from "./syncCore";

// fixtures/contract-valid.jsonl is koala-kollect-data's examples/valid.jsonl,
// copied at ee05303 (data PR #2). It is the contract's own valid example of
// every record type, so syncing it end to end also checks that
// convex/schema.ts still accepts what the contract allows. Refresh the copy
// when the contract changes.

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);

type Rec = { key: string } & Record<string, unknown>;

// The contract's layout: one file per type, or per type and site.
function pathFor(type: RecordType, rec: Rec): string {
  const table = TYPE_TO_TABLE[type];
  return typeof rec.site === "string" ? `data/${table}/${rec.site}.jsonl` : `data/${table}.jsonl`;
}

function fixtureFiles(): Record<string, { type: RecordType; lines: string[] }> {
  const files: Record<string, { type: RecordType; lines: string[] }> = {};
  for (const line of fixture.trim().split("\n")) {
    const { type, record } = JSON.parse(line) as { type: string; record: Rec };
    if (!(type in TYPE_TO_TABLE)) continue; // ingest_run is audit only
    const path = pathFor(type as RecordType, record);
    files[path] ??= { type: type as RecordType, lines: [] };
    files[path].lines.push(JSON.stringify(record));
  }
  return files;
}

const enc = new TextEncoder();

// Builds a data repo at one commit: file bodies plus a manifest that matches
// them, then lets the caller tamper with either.
async function repoAt(
  files = fixtureFiles(),
  tamper: (m: { files: Record<string, { type: string; rows: number; sha256: string }> }, bodies: Map<string, Body>) => void = () => {},
) {
  const bodies = new Map<string, Body>();
  const manifest = { schema_version: 1, generated_at: "2026-10-08T00:00:00Z", files: {} as Record<string, { type: string; rows: number; sha256: string }> };
  for (const [path, f] of Object.entries(files)) {
    const body = f.lines.map((l) => `${l}\n`).join("");
    bodies.set(path, body);
    manifest.files[path] = { type: f.type, rows: f.lines.length, sha256: await sha256Hex(enc.encode(body).buffer as ArrayBuffer) };
  }
  tamper(manifest, bodies);
  bodies.set("manifest.json", JSON.stringify(manifest));
  return bodies;
}

type Body = string | Uint8Array<ArrayBuffer> | (() => Response);

function serve(repos: Record<string, Map<string, Body>>, main: string | number = COMMIT_A) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    if (url === "https://github.com/hotavocado/koala-kollect-data.git/info/refs?service=git-upload-pack") {
      if (typeof main === "number") return new Response("forbidden", { status: main });
      // The shape GitHub serves, captured from this repo on 2026-10-08.
      return new Response(
        `001e# service=git-upload-pack\n0000015a${main} HEAD\0multi_ack thin-pack symref=HEAD:refs/heads/main\n003d${main} refs/heads/main\n0000`,
      );
    }
    const m = url.match(/^https:\/\/raw\.githubusercontent\.com\/hotavocado\/koala-kollect-data\/([0-9a-f]{40})\/(.+)$/);
    const body = m ? repos[m[1]]?.get(m[2]) : undefined;
    if (body === undefined) return new Response("not found", { status: 404 });
    return typeof body === "function" ? body() : new Response(body);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

async function counts(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const out: Record<string, number> = {};
    for (const table of SYNCED_TABLES) out[table] = (await ctx.db.query(table).collect()).length;
    return out;
  });
}

async function syncs(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => await ctx.db.query("data_syncs").collect());
}

const EMPTY = Object.fromEntries(SYNCED_TABLES.map((t) => [t, 0]));

describe("dataSync.run", () => {
  test("syncs every record type from the contract's valid examples", async () => {
    const t = convexTest(schema, modules);
    serve({ [COMMIT_A]: await repoAt() });

    const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

    expect(r.status).toBe("ok");
    const expected = Object.fromEntries(SYNCED_TABLES.map((t) => [t, 0]));
    for (const f of Object.values(fixtureFiles())) expected[TYPE_TO_TABLE[f.type]] += f.lines.length;
    expect(await counts(t)).toEqual(expected);
    for (const n of Object.values(expected)) expect(n).toBeGreaterThan(0); // every table exercised
    const [row] = await syncs(t);
    const total = Object.values(expected).reduce((a, b) => a + b, 0);
    expect(row).toMatchObject({ data_commit: COMMIT_A, status: "ok", upserted: total });
    expect(row.manifest_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("skips a commit already synced, and a forced re-run writes nothing", async () => {
    const t = convexTest(schema, modules);
    serve({ [COMMIT_A]: await repoAt() });
    await t.action(internal.dataSync.run, { commit: COMMIT_A });

    expect((await t.action(internal.dataSync.run, { commit: COMMIT_A })).status).toBe("skipped");
    const forced = await t.action(internal.dataSync.run, { commit: COMMIT_A, force: true });
    expect(forced.status).toBe("ok");
    expect((await syncs(t)).at(-1)).toMatchObject({ status: "ok", upserted: 0 });
  });

  test("replaces a changed record, including a field the new version drops", async () => {
    const t = convexTest(schema, modules);
    const files = fixtureFiles();
    const obsPath = Object.keys(files).find((p) => files[p].type === "card_observation")!;
    const changed = fixtureFiles();
    const obs = JSON.parse(changed[obsPath].lines[0]) as Rec;
    obs.superseded_at = "2026-10-09T00:00:00Z";
    delete obs.effect;
    changed[obsPath].lines[0] = JSON.stringify(obs);
    serve({ [COMMIT_A]: await repoAt(files), [COMMIT_B]: await repoAt(changed) });

    await t.action(internal.dataSync.run, { commit: COMMIT_A });
    const r = await t.action(internal.dataSync.run, { commit: COMMIT_B });

    expect(r.status).toBe("ok");
    expect((await syncs(t)).at(-1)).toMatchObject({ status: "ok", upserted: 1 });
    const stored = await t.run(async (ctx) =>
      ctx.db.query("card_observations").withIndex("by_key", (q) => q.eq("key", obs.key)).unique(),
    );
    expect(stored?.superseded_at).toBe("2026-10-09T00:00:00Z");
    expect(stored).not.toHaveProperty("effect");
  });

  test("stores a product's release_date_source", async () => {
    const t = convexTest(schema, modules);
    const files = fixtureFiles();
    const productPath = Object.keys(files).find((p) => files[p].type === "product")!;
    const product = JSON.parse(files[productPath].lines[0]) as Rec;
    product.release_date = "2026-08-22";
    product.release_date_source = "https://www.onepiece-cardgame.com/products/boosters/op17.php";
    files[productPath].lines[0] = JSON.stringify(product);
    serve({ [COMMIT_A]: await repoAt(files) });

    expect((await t.action(internal.dataSync.run, { commit: COMMIT_A })).status).toBe("ok");
    const stored = await t.run(async (ctx) =>
      ctx.db.query("products").withIndex("by_key", (q) => q.eq("key", product.key)).unique(),
    );
    expect(stored?.release_date_source).toBe(product.release_date_source);
  });

  test("never deletes a record that leaves the data repo", async () => {
    const t = convexTest(schema, modules);
    const fewer = fixtureFiles();
    const linkPath = Object.keys(fewer).find((p) => fewer[p].type === "printing_link")!;
    fewer[linkPath].lines = [];
    serve({ [COMMIT_A]: await repoAt(), [COMMIT_B]: await repoAt(fewer) });

    await t.action(internal.dataSync.run, { commit: COMMIT_A });
    expect((await t.action(internal.dataSync.run, { commit: COMMIT_B })).status).toBe("ok");
    expect((await counts(t)).printing_links).toBe(1);
  });

  // Each refusal must name its reason and leave every table empty.
  const refusals: [string, (m: { files: Record<string, { type: string; rows: number; sha256: string }> }, b: Map<string, Body>) => void, RegExp][] = [
    ["a sha256 mismatch", (m) => { m.files["data/cards.jsonl"].sha256 = "0".repeat(64); }, /^sha256 mismatch on data\/cards\.jsonl/],
    ["a row count mismatch", (m) => { m.files["data/cards.jsonl"].rows += 1; }, /^row count mismatch on data\/cards\.jsonl: manifest 3, file 2$/],
    ["a file the manifest lists but the repo lacks", (_m, b) => { b.delete("data/distributions.jsonl"); }, /^data\/distributions\.jsonl: HTTP 404 \(not found\)$/],
    ["a path outside the data layout", (m) => { m.files["runs/2026/10/x.jsonl"] = { ...m.files["data/cards.jsonl"] }; }, /runs\/2026\/10\/x\.jsonl, which is not a data file path$/],
    ["an unknown record type", (m) => { m.files["data/cards.jsonl"].type = "ingest_run"; }, /has unknown type "ingest_run"$/],
  ];
  test.each(refusals)("refuses %s and writes nothing", async (_name, tamper, reason) => {
    const t = convexTest(schema, modules);
    serve({ [COMMIT_A]: await repoAt(undefined, tamper) });

    const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

    expect(r.status).toBe("refused");
    expect(r.detail).toMatch(reason);
    expect(await counts(t)).toEqual(EMPTY);
    expect(await syncs(t)).toMatchObject([{ status: "refused", refusal: r.detail }]);
  });

  test("refuses a file whose bytes match its sha256 but are not UTF-8", async () => {
    const t = convexTest(schema, modules);
    const bad = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d, 0x0a]); // "{", two invalid bytes, "}", newline
    const repo = await repoAt(undefined, (m, b) => {
      b.set("data/cards.jsonl", bad);
      m.files["data/cards.jsonl"].rows = 1;
    });
    const manifest = JSON.parse(repo.get("manifest.json") as string);
    manifest.files["data/cards.jsonl"].sha256 = await sha256Hex(bad.buffer as ArrayBuffer);
    repo.set("manifest.json", JSON.stringify(manifest));
    serve({ [COMMIT_A]: repo });

    const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

    expect(r).toMatchObject({ status: "refused", detail: "data/cards.jsonl is not valid UTF-8" });
    expect(await syncs(t)).toMatchObject([{ status: "refused" }]);
    expect(await counts(t)).toEqual(EMPTY);
  });

  test("refuses when a body fails mid-read, and closes the sync row", async () => {
    const t = convexTest(schema, modules);
    const broken = () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.error(new Error("connection reset"));
          },
        }),
      );
    serve({ [COMMIT_A]: await repoAt(undefined, (_m, b) => b.set("data/cards.jsonl", broken)) });

    const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

    expect(r).toMatchObject({ status: "refused", detail: "data/cards.jsonl: connection reset" });
    expect(await syncs(t)).toMatchObject([{ status: "refused" }]);
  });

  test("refuses when the commit has no manifest", async () => {
    const t = convexTest(schema, modules);
    serve({});
    const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });
    expect(r).toMatchObject({ status: "refused", detail: "manifest.json: HTTP 404 (not found)" });
    expect(await syncs(t)).toMatchObject([{ status: "refused", manifest_sha256: "" }]);
  });

  test("a record the schema rejects fails the sync and is not written", async () => {
    const t = convexTest(schema, modules);
    const files = fixtureFiles();
    const prtPath = Object.keys(files).find((p) => files[p].type === "printing")!;
    const bad = JSON.parse(files[prtPath].lines[0]) as Rec;
    bad.variant = "foil";
    files[prtPath].lines[0] = JSON.stringify(bad);
    serve({ [COMMIT_A]: await repoAt(files) });

    const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

    expect(r.status).toBe("failed");
    expect(await syncs(t)).toMatchObject([{ status: "failed" }]);
    const stored = await t.run(async (ctx) =>
      ctx.db.query("printings").withIndex("by_key", (q) => q.eq("key", bad.key)).unique(),
    );
    expect(stored).toBeNull();
  });

  test("with no commit given, syncs the data repo's main", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = serve({ [COMMIT_B]: await repoAt() }, COMMIT_B);

    const r = await t.action(internal.dataSync.run, {});

    expect(r).toMatchObject({ status: "ok", data_commit: COMMIT_B });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ "User-Agent": "koala-kollect-sync" });
  });

  test("records a refusal when main cannot be read", async () => {
    const t = convexTest(schema, modules);
    serve({}, 403);

    const r = await t.action(internal.dataSync.run, {});

    expect(r).toMatchObject({ status: "refused", detail: "data repo main: HTTP 403 (forbidden)" });
    expect(await syncs(t)).toMatchObject([{ status: "refused", data_commit: "", refusal: "data repo main: HTTP 403 (forbidden)" }]);
  });

  test("does not start while another sync is running", async () => {
    const t = convexTest(schema, modules);
    serve({ [COMMIT_A]: await repoAt() });
    await t.run(async (ctx) => {
      await ctx.db.insert("data_syncs", {
        data_commit: COMMIT_B,
        manifest_sha256: "",
        started_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        status: "running",
      });
    });

    const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

    expect(r).toMatchObject({ status: "skipped", detail: "another sync is running" });
    expect(await counts(t)).toEqual(EMPTY);
  });
});
