/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import fixture from "./fixtures/contract-valid.jsonl?raw";
import schema from "./schema";
import { type RecordType, SYNCED_TABLES, TYPE_TO_TABLE, sha256Hex } from "./syncCore";

// fixtures/contract-valid.jsonl is koala-kollect-data's examples/valid.jsonl,
// copied from the promo-origin data branch at 5a8e6d2 ahead of its merge
// (tier, dates and quantity on the claim; site on the distribution). It is the contract's own valid example of
// every record type, so syncing it end to end also checks that
// convex/schema.ts still accepts what the contract allows. Refresh the copy
// when the contract changes.

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);

type Rec = { key: string } & Record<string, unknown>;

// The contract's layout: one file per type, or per type and site. A
// distribution carries a site but still lives in one file.
const ONE_FILE: ReadonlySet<RecordType> = new Set(["card", "distribution", "printing_distribution", "printing_link"]);
function pathFor(type: RecordType, rec: Rec): string {
  const table = TYPE_TO_TABLE[type];
  return !ONE_FILE.has(type) && typeof rec.site === "string" ? `data/${table}/${rec.site}.jsonl` : `data/${table}.jsonl`;
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

const newTest = () => convexTest(schema, modules);

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

  // A printing whose image the proxy refuses shows the text face, silently. The
  // sync counts them over the whole commit, by site, so a site that changes its
  // image path shows up in data_syncs rather than as grey cards.
  describe("printing images the proxy refuses", () => {
    function printingFiles(files: ReturnType<typeof fixtureFiles>) {
      return Object.keys(files).filter((p) => files[p].type === "printing");
    }
    // The fixture's DON printings, read from the fixture, not typed: every
    // tcgcsv image is on tcgplayer-cdn, which the proxy refuses. A tcgcsv
    // printing with no image yet has nothing to refuse and is not counted.
    const DON_KEYS = (fixtureFiles()["data/printings/tcgcsv.jsonl"]?.lines ?? [])
      .map((l) => JSON.parse(l) as Rec)
      .filter((r) => r.image_url !== undefined)
      .map((r) => r.key)
      .sort();
    const N = DON_KEYS.length;

    test("the fixture's tcgcsv DON printings are counted", async () => {
      expect(N).toBeGreaterThan(1); // normal, foil and gold, so the count is not a lone 1
      const t = convexTest(schema, modules);
      serve({ [COMMIT_A]: await repoAt() });

      const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

      expect(r.detail).toMatch(new RegExp(`; ${N} printing images not proxied \\(tcgcsv ${N}\\): ${DON_KEYS.join(", ")}$`));
      expect((await syncs(t))[0]).toMatchObject({
        unproxied_images: N,
        unproxied_image_keys: DON_KEYS,
        unproxied_image_sites: [{ site: "tcgcsv", count: N }],
      });
    });

    test("an official printing outside the file rule is counted under its site", async () => {
      const t = convexTest(schema, modules);
      const files = fixtureFiles();
      const enPath = printingFiles(files).find((p) => p.endsWith("/en.jsonl"))!;
      const prt = JSON.parse(files[enPath].lines[0]) as Rec;
      prt.image_url = String(prt.image_url).replace(/\.png$/, ".jpg");
      files[enPath].lines[0] = JSON.stringify(prt);
      serve({ [COMMIT_A]: await repoAt(files) });

      const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

      expect(r.status).toBe("ok");
      const keys = [prt.key, ...DON_KEYS].sort();
      expect(r.detail).toMatch(
        new RegExp(`; ${N + 1} printing images not proxied \\(en 1, tcgcsv ${N}\\): ${keys.join(", ")}$`),
      );
      expect((await syncs(t))[0]).toMatchObject({
        unproxied_images: N + 1,
        unproxied_image_keys: keys,
        unproxied_image_sites: [
          { site: "en", count: 1 },
          { site: "tcgcsv", count: N },
        ],
      });
    });

    test("none refused: the count is 0 and no keys are stored", async () => {
      const t = convexTest(schema, modules);
      const files = fixtureFiles();
      for (const p of printingFiles(files)) {
        if (p.endsWith("/tcgcsv.jsonl")) delete files[p];
      }
      serve({ [COMMIT_A]: await repoAt(files) });

      const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

      expect(r.detail).toMatch(/; 0 printing images not proxied$/);
      const [row] = await syncs(t);
      expect(row.unproxied_images).toBe(0);
      expect(row).not.toHaveProperty("unproxied_image_keys");
      expect(row).not.toHaveProperty("unproxied_image_sites");
    });

    test("lists at most 50 keys and still counts them all", async () => {
      const t = convexTest(schema, modules);
      const files = fixtureFiles();
      const enPath = printingFiles(files).find((p) => p.endsWith("/en.jsonl"))!;
      const base = JSON.parse(files[enPath].lines[0]) as Rec;
      for (let i = 0; i < 60; i++) {
        const key = `prt_9999${String(i).padStart(8, "0")}`;
        files[enPath].lines.push(JSON.stringify({ ...base, key, image_url: `https://example.com/${i}.png` }));
      }
      serve({ [COMMIT_A]: await repoAt(files) });

      const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

      expect(r.status).toBe("ok");
      const [row] = await syncs(t);
      expect(row.unproxied_images).toBe(60 + N);
      expect(row.unproxied_image_keys).toHaveLength(50);
      expect(row.unproxied_image_sites).toEqual([
        { site: "en", count: 60 },
        { site: "tcgcsv", count: N },
      ]);
      expect(r.detail).toMatch(
        new RegExp(`; ${60 + N} printing images not proxied \\(en 60, tcgcsv ${N}\\): .+, and ${10 + N} more$`),
      );
    });
  });

  // data/retired_printings.jsonl names printings the data repo removed (a cn
  // CMS double-save collapsed onto its survivor). Upserts never delete, so the
  // sync deletes each listed printing and every row that hangs off it, by the
  // exact printing key.
  describe("retired printings", () => {
    const RETIRED = "prt_000000000001"; // the fixture printing with a row in every dependent table
    const SURVIVOR = "prt_000000000002";
    const PREFIXED = `${RETIRED}1`; // shares the retired key as a prefix and must survive
    const RETIRED_PATH = "data/retired_printings.jsonl";
    const DEPENDENTS = ["printing_products", "printing_distributions", "printing_locators"] as const;

    function retiredRow(key: string, extra: Record<string, unknown> = {}) {
      return JSON.stringify({
        key,
        printing_key: key,
        reason: "cn CMS double-save",
        retired_at: "2026-10-09T00:00:00Z",
        source_ids: ["4648"],
        ...extra,
      });
    }

    // The fixture plus a printing whose key has the retired key as a prefix,
    // listed under the same product.
    function withPrefixed() {
      const files = fixtureFiles();
      for (const f of Object.values(files)) {
        if (f.type !== "printing" && f.type !== "printing_product") continue;
        const line = f.lines.map((l) => JSON.parse(l) as Rec).find((r) => r.key === RETIRED || r.printing_key === RETIRED);
        if (!line) continue;
        const copy = f.type === "printing" ? { ...line, key: PREFIXED } : { ...line, printing_key: PREFIXED, key: `${PREFIXED}@${String(line.product_key)}` };
        f.lines.push(JSON.stringify(copy));
      }
      return files;
    }

    // What the data repo commits after retiring RETIRED: its printing and its
    // product, claim and link rows are gone, its locator now points at the
    // survivor, and the retired file lists it.
    function afterRetire(files: ReturnType<typeof fixtureFiles>) {
      for (const f of Object.values(files)) {
        f.lines = f.lines.flatMap((l) => {
          const r = JSON.parse(l) as Rec;
          if (f.type === "printing_locator" && r.printing_key === RETIRED) return [JSON.stringify({ ...r, printing_key: SURVIVOR })];
          if (r.key === RETIRED && f.type === "printing") return [];
          if (r.printing_key === RETIRED || r.printing_a === RETIRED || r.printing_b === RETIRED) return [];
          return [l];
        });
      }
      files[RETIRED_PATH] = { type: "retired_printing" as RecordType, lines: [retiredRow(RETIRED)] };
      return files;
    }

    async function rowsFor(t: ReturnType<typeof newTest>, key: string) {
      return await t.run(async (ctx) => {
        const out: Record<string, number> = {
          printings: (await ctx.db.query("printings").withIndex("by_key", (q) => q.eq("key", key)).collect()).length,
          printing_links:
            (await ctx.db.query("printing_links").withIndex("by_printing_a", (q) => q.eq("printing_a", key)).collect()).length +
            (await ctx.db.query("printing_links").withIndex("by_printing_b", (q) => q.eq("printing_b", key)).collect()).length,
        };
        for (const table of DEPENDENTS) {
          out[table] = (await ctx.db.query(table).withIndex("by_printing", (q) => q.eq("printing_key", key)).collect()).length;
        }
        return out;
      });
    }

    test("deletes the printing and every row on its key, and nothing on any other key", async () => {
      const t = newTest();
      serve({ [COMMIT_A]: await repoAt(withPrefixed()), [COMMIT_B]: await repoAt(afterRetire(withPrefixed())) });
      await t.action(internal.dataSync.run, { commit: COMMIT_A });
      // Every dependent table holds a row for the retired key before, so an
      // empty result after is the delete and not an empty fixture.
      expect(await rowsFor(t, RETIRED)).toEqual({ printings: 1, printing_links: 1, printing_products: 1, printing_distributions: 1, printing_locators: 1 });
      const prefixedBefore = await rowsFor(t, PREFIXED);
      const before = await counts(t);

      const r = await t.action(internal.dataSync.run, { commit: COMMIT_B });

      expect(r.status).toBe("ok");
      expect(await rowsFor(t, RETIRED)).toEqual({ printings: 0, printing_links: 0, printing_products: 0, printing_distributions: 0, printing_locators: 0 });
      expect(await rowsFor(t, PREFIXED)).toEqual(prefixedBefore);
      expect(prefixedBefore).toMatchObject({ printings: 1, printing_products: 1 });
      expect(await counts(t)).toEqual({
        ...before,
        printings: before.printings - 1,
        printing_products: before.printing_products - 1,
        printing_distributions: before.printing_distributions - 1,
        printing_links: before.printing_links - 1,
      });
      expect(r.detail).toMatch(/, 1 printing retired;/);
      expect((await syncs(t)).at(-1)).toMatchObject({ status: "ok", retired: 1 });
    });

    // The cn dedupe moves the extra ids' locators onto the survivor in the
    // same commit that retires them. The locator key is unchanged, so only
    // its printing_key says which printing it belongs to.
    test("keeps a locator the same commit moved onto the survivor", async () => {
      const t = newTest();
      serve({ [COMMIT_A]: await repoAt(), [COMMIT_B]: await repoAt(afterRetire(fixtureFiles())) });
      await t.action(internal.dataSync.run, { commit: COMMIT_A });
      const [locator] = await t.run(async (ctx) =>
        await ctx.db.query("printing_locators").withIndex("by_printing", (q) => q.eq("printing_key", RETIRED)).collect(),
      );

      await t.action(internal.dataSync.run, { commit: COMMIT_B });

      const moved = await t.run(async (ctx) =>
        await ctx.db.query("printing_locators").withIndex("by_key", (q) => q.eq("key", locator.key)).unique(),
      );
      expect(moved).toMatchObject({ key: locator.key, printing_key: SURVIVOR });
    });

    test("re-reading the same retired file deletes nothing more", async () => {
      const t = newTest();
      serve({ [COMMIT_A]: await repoAt(), [COMMIT_B]: await repoAt(afterRetire(fixtureFiles())) });
      await t.action(internal.dataSync.run, { commit: COMMIT_A });
      await t.action(internal.dataSync.run, { commit: COMMIT_B });
      const after = await counts(t);

      const again = await t.action(internal.dataSync.run, { commit: COMMIT_B, force: true });

      expect(again.status).toBe("ok");
      expect(again.detail).toMatch(/, 0 printings retired;/);
      expect(await counts(t)).toEqual(after);
      expect((await syncs(t)).at(-1)).toMatchObject({ status: "ok", upserted: 0, retired: 0 });
    });

    test.each<[string, (files: ReturnType<typeof fixtureFiles>) => void, RegExp]>([
      [
        "a retired key that is still a printing in the same commit",
        (files) => { files[RETIRED_PATH] = { type: "retired_printing" as RecordType, lines: [retiredRow(RETIRED)] }; },
        /^data\/retired_printings\.jsonl line 1: prt_000000000001 is retired and still a printing in this commit$/,
      ],
      [
        "a row whose key is not its printing_key",
        (files) => { files[RETIRED_PATH] = { type: "retired_printing" as RecordType, lines: [retiredRow("prt_gone", { printing_key: "prt_other" })] }; },
        /^data\/retired_printings\.jsonl line 1: key prt_gone is not its printing_key "prt_other"$/,
      ],
      [
        "a row with no reason",
        (files) => { files[RETIRED_PATH] = { type: "retired_printing" as RecordType, lines: [retiredRow("prt_gone", { reason: undefined })] }; },
        /^data\/retired_printings\.jsonl line 1: prt_gone has no reason$/,
      ],
    ])("refuses %s and writes nothing", async (_name, change, message) => {
      const t = newTest();
      const files = fixtureFiles();
      change(files);
      serve({ [COMMIT_A]: await repoAt(files) });

      const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

      expect(r.status).toBe("refused");
      expect(r.detail).toMatch(message);
      expect(await counts(t)).toEqual(EMPTY);
    });
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

  // cn lists OP06-050 twice in OPC-06 (ids 2763 and 2764): same name, rarity
  // and number, and only 2764's image file says P. The contract mints each
  // printing's key from cn:{id}, so they are two printings of one card; a key
  // built from site and number would fold them into one.
  test("cn's OP06-050 pair stays two printings of one card through a sync and a re-sync", async () => {
    const t = convexTest(schema, modules);
    serve({ [COMMIT_A]: await repoAt() });
    await t.action(internal.dataSync.run, { commit: COMMIT_A });
    await t.action(internal.dataSync.run, { commit: COMMIT_A, force: true });

    const pair = await t.run(async (ctx) =>
      Promise.all(
        ["cn:2763", "cn:2764"].map(async (key) => {
          const loc = await ctx.db.query("printing_locators").withIndex("by_key", (q) => q.eq("key", key)).unique();
          const prt = await ctx.db.query("printings").withIndex("by_key", (q) => q.eq("key", loc!.printing_key)).unique();
          return { loc: loc!, prt: prt! };
        }),
      ),
    );
    const [base, parallel] = pair;
    expect(base.prt.key).not.toBe(parallel.prt.key);
    expect(base.prt.card_key).toBe(parallel.prt.card_key);
    expect(base.prt).toMatchObject({ site: "cn", variant: "base" });
    expect(base.prt).not.toHaveProperty("image_token");
    expect(parallel.prt).toMatchObject({ site: "cn", variant: "parallel", image_token: "P" });
    const onCard = await t.run(async (ctx) =>
      ctx.db.query("printings").withIndex("by_card", (q) => q.eq("card_key", base.prt.card_key)).collect(),
    );
    expect(onCard.map((p) => p.key).sort()).toEqual([base.prt.key, parallel.prt.key].sort());
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
    bad.variant = "holo"; // not a variant on any site
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

  // The contract dropped last_seen_at (koala-kollect-data ed46bea). Narrowing
  // the schema never goes red on the valid fixture, so pin the refusal itself.
  test.each(["card_observation", "printing", "printing_locator", "product", "printing_product"] as const)(
    "a %s carrying last_seen_at fails the sync",
    async (type) => {
      const t = convexTest(schema, modules);
      const files = fixtureFiles();
      const path = Object.keys(files).find((p) => files[p].type === type)!;
      const stale = JSON.parse(files[path].lines[0]) as Rec;
      stale.last_seen_at = "2026-10-08T00:00:00Z";
      files[path].lines[0] = JSON.stringify(stale);
      serve({ [COMMIT_A]: await repoAt(files) });

      expect((await t.action(internal.dataSync.run, { commit: COMMIT_A })).status).toBe("failed");
      expect(await syncs(t)).toMatchObject([{ status: "failed" }]);
    },
  );

  // Same close: block_icon is a printing fact, required there, refused on the observation.
  test.each([
    ["a card_observation carrying block_icon", "card_observation", (r: Rec) => { r.block_icon = 4; }],
    ["a printing without block_icon", "printing", (r: Rec) => { delete r.block_icon; }],
  ] as const)("%s fails the sync", async (_name, type, change) => {
    const t = convexTest(schema, modules);
    const files = fixtureFiles();
    const path = Object.keys(files).find((p) => files[p].type === type)!;
    const stale = JSON.parse(files[path].lines[0]) as Rec;
    change(stale);
    files[path].lines[0] = JSON.stringify(stale);
    serve({ [COMMIT_A]: await repoAt(files) });

    expect((await t.action(internal.dataSync.run, { commit: COMMIT_A })).status).toBe("failed");
    expect(await syncs(t)).toMatchObject([{ status: "failed" }]);
  });

  test("a distribution still carrying a claim's tier fails the sync", async () => {
    // Tier, dates and quantity moved onto the claim. Data in the old shape is
    // a mismatch to see, not a field to drop quietly.
    const t = convexTest(schema, modules);
    const files = fixtureFiles();
    const distPath = Object.keys(files).find((p) => files[p].type === "distribution")!;
    const old = JSON.parse(files[distPath].lines[0]) as Rec;
    old.tier = "participant";
    files[distPath].lines[0] = JSON.stringify(old);
    serve({ [COMMIT_A]: await repoAt(files) });

    expect((await t.action(internal.dataSync.run, { commit: COMMIT_A })).status).toBe("failed");
    expect(await syncs(t)).toMatchObject([{ status: "failed" }]);
  });

  test("a distribution with no site fails the sync", async () => {
    const t = convexTest(schema, modules);
    const files = fixtureFiles();
    const distPath = Object.keys(files).find((p) => files[p].type === "distribution")!;
    const noSite = JSON.parse(files[distPath].lines[0]) as Rec;
    delete noSite.site;
    files[distPath].lines[0] = JSON.stringify(noSite);
    serve({ [COMMIT_A]: await repoAt(files) });

    expect((await t.action(internal.dataSync.run, { commit: COMMIT_A })).status).toBe("failed");
    expect(await syncs(t)).toMatchObject([{ status: "failed" }]);
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

// TCGplayer lists a new DON at imageCount 0 until an image exists, so the data
// repo omits image_url on those tcgcsv printings. Every official site still
// requires it: the sync refuses the commit before writing, and the schema
// rejects the row on its own.
describe("printings with no image_url", () => {
  function withoutImage(path: string) {
    const files = fixtureFiles();
    const prt = JSON.parse(files[path].lines[0]) as Rec;
    delete prt.image_url;
    files[path].lines[0] = JSON.stringify(prt);
    return { files, prt };
  }

  test("a tcgcsv printing syncs without one and is not counted as refused by the proxy", async () => {
    const t = convexTest(schema, modules);
    const { files, prt } = withoutImage("data/printings/tcgcsv.jsonl");
    serve({ [COMMIT_A]: await repoAt(files) });

    const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

    expect(r.status).toBe("ok");
    const stored = await t.run(
      async (ctx) => await ctx.db.query("printings").withIndex("by_key", (q) => q.eq("key", prt.key)).unique(),
    );
    expect(stored).not.toBeNull();
    expect(stored).not.toHaveProperty("image_url");
    const sync = (await syncs(t))[0];
    expect(sync.unproxied_image_keys).not.toContain(prt.key);
    expect(sync.unproxied_image_sites).toEqual([{ site: "tcgcsv", count: sync.unproxied_images }]);
  });

  // Every official site's printing file in the fixture, read from the fixture,
  // so a site added to it is covered without editing this list.
  const OFFICIAL = Object.keys(fixtureFiles()).filter(
    (p) => fixtureFiles()[p].type === "printing" && !p.endsWith("/tcgcsv.jsonl"),
  );

  test("the fixture has official printing files to check", () => {
    expect(OFFICIAL.length).toBeGreaterThan(1);
  });

  test.each(OFFICIAL)("%s: a printing with no image_url refuses the commit and writes nothing", async (path) => {
    const t = convexTest(schema, modules);
    const { files, prt } = withoutImage(path);
    serve({ [COMMIT_A]: await repoAt(files) });

    const r = await t.action(internal.dataSync.run, { commit: COMMIT_A });

    expect(r.status).toBe("refused");
    expect(r.detail).toBe(`${path} line 1: printing ${prt.key} on ${String(prt.site)} has no image_url`);
    expect(await counts(t)).toEqual(EMPTY);
  });

  test.each(OFFICIAL)("%s: the schema rejects a printing with no image_url", async (path) => {
    const t = convexTest(schema, modules);
    const { prt } = withoutImage(path);
    await expect(t.run(async (ctx) => void (await ctx.db.insert("printings", prt as never)))).rejects.toThrow();
  });
});
