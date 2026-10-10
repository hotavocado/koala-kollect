/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { SCAN_PAGE } from "./siteSweep";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;

const RETIRED = ["asia-en", "tc"] as const;
const SEEN = "2026-10-01T00:00:00Z";

// Two products per site, each listing two printings; one distribution per site
// with two claims; one observation and one locator per site. Live sites are
// every one the field admits besides the retired two.
async function seed(t: T) {
  await t.run(async (ctx) => {
    for (const site of ["asia-en", "tc", "en", "jp", "cn"] as const) {
      for (const series of ["s1", "s2"]) {
        const product_key = `${site}:${series}`;
        await ctx.db.insert("products", { key: product_key, site, series_id: series, name: `${site} ${series}`, kind: "booster", first_seen_at: SEEN });
        for (const prt of ["prt_a", "prt_b"]) {
          await ctx.db.insert("printing_products", { key: `${prt}@${product_key}`, printing_key: prt, product_key, first_seen_at: SEEN });
        }
      }
    }
    for (const site of ["asia-en", "tc", "en", "jp", "cn", "tcgcsv"] as const) {
      const region = site === "asia-en" || site === "tc" ? "asia" : site === "tcgcsv" ? "en" : site;
      const key = `dist_${site}`;
      await ctx.db.insert("distributions", { key, site, region, kind: "promo_pack", name: `${site} pack` });
      for (const prt of ["prt_a", "prt_b"]) {
        await ctx.db.insert("printing_distributions", {
          key: `ev_${site}_${prt}`,
          printing_key: prt,
          distribution_key: key,
          source: "manual",
          source_url: "https://example.com",
          quote: "q",
          confidence: "authoritative",
          observed_at: SEEN,
        });
      }
      await insertObservation(ctx, site, "card_x");
      await ctx.db.insert("printing_locators", { key: `${site}:img`, printing_key: `prt_${site}`, site, image_id: "img", first_seen_at: SEEN });
    }
  });
}

type Site = "asia-en" | "tc" | "en" | "jp" | "cn" | "tcgcsv";
async function insertObservation(ctx: Parameters<Parameters<T["run"]>[0]>[0], site: Site, card_key: string) {
  await ctx.db.insert("card_observations", {
    key: `${card_key}:${site}:h`,
    card_key,
    site,
    lang: "en",
    observation_hash: "h",
    name: "Luffy",
    category: "character",
    colors: ["red"],
    attributes: ["strike"],
    types: [],
    first_seen_at: SEEN,
  });
}

// Every row of the swept tables, as site -> count, read straight from the db.
async function snapshot(t: T) {
  return await t.run(async (ctx) => {
    const bySite = (rows: { site: string }[]) => {
      const out: Record<string, number> = {};
      for (const r of rows) out[r.site] = (out[r.site] ?? 0) + 1;
      return out;
    };
    // A link row's site is its product's or distribution's, read off the key.
    const products = await ctx.db.query("printing_products").collect();
    const claims = await ctx.db.query("printing_distributions").collect();
    return {
      products: bySite(await ctx.db.query("products").collect()),
      printing_products: bySite(products.map((r) => ({ site: r.product_key.split(":")[0] }))),
      distributions: bySite(await ctx.db.query("distributions").collect()),
      printing_distributions: bySite(claims.map((r) => ({ site: r.distribution_key.slice("dist_".length) }))),
      card_observations: bySite(await ctx.db.query("card_observations").collect()),
      printing_locators: bySite(await ctx.db.query("printing_locators").collect()),
      printings: bySite(await ctx.db.query("printings").collect()),
    };
  });
}

const SEEDED = {
  products: { "asia-en": 2, tc: 2, en: 2, jp: 2, cn: 2 },
  printing_products: { "asia-en": 4, tc: 4, en: 4, jp: 4, cn: 4 },
  distributions: { "asia-en": 1, tc: 1, en: 1, jp: 1, cn: 1, tcgcsv: 1 },
  printing_distributions: { "asia-en": 2, tc: 2, en: 2, jp: 2, cn: 2, tcgcsv: 2 },
  card_observations: { "asia-en": 1, tc: 1, en: 1, jp: 1, cn: 1, tcgcsv: 1 },
  printing_locators: { "asia-en": 1, tc: 1, en: 1, jp: 1, cn: 1, tcgcsv: 1 },
  printings: {},
};

const SWEPT = {
  products: 4,
  printing_products: 8,
  distributions: 2,
  printing_distributions: 4,
  card_observations: 2,
  printing_locators: 2,
  printings_remaining: 0,
};

const ZERO = Object.fromEntries(Object.keys(SWEPT).map((k) => [k, 0]));

function without<R extends Record<string, number>>(counts: R): Partial<R> {
  const out: Record<string, number> = { ...counts };
  for (const site of RETIRED) delete out[site];
  return out as Partial<R>;
}

const sweep = (t: T, dryRun: boolean) => t.action(internal.siteSweep.sweepRetiredSites, { dryRun });

describe("sweepRetiredSites", () => {
  test("dry-run returns the exact counts and deletes nothing", async () => {
    const t = newTest();
    await seed(t);
    expect(await snapshot(t)).toEqual(SEEDED);
    const r = await sweep(t, true);
    expect(r).toEqual({ dryRun: true, ...SWEPT });
    expect(await snapshot(t)).toEqual(SEEDED);
  });

  test("a real run deletes every retired-site row and leaves every live-site row", async () => {
    const t = newTest();
    await seed(t);
    const r = await sweep(t, false);
    expect(r).toMatchObject({ dryRun: false, ...SWEPT });
    expect(r.rebuild).toBeDefined();
    const after = await snapshot(t);
    expect(after).toEqual({
      products: without(SEEDED.products),
      printing_products: without(SEEDED.printing_products),
      distributions: without(SEEDED.distributions),
      printing_distributions: without(SEEDED.printing_distributions),
      card_observations: without(SEEDED.card_observations),
      printing_locators: without(SEEDED.printing_locators),
      printings: {},
    });
    // The set index is rebuilt from what is left: no set lists a swept product.
    const sets = await t.run(async (ctx) => await ctx.db.query("card_sets").collect());
    expect(sets.length).toBeGreaterThan(0);
    for (const s of sets) for (const k of s.product_keys) expect(k).toMatch(/^(en|jp|cn):/);
  });

  test("a second real run deletes nothing and still rebuilds the set index", async () => {
    const t = newTest();
    await seed(t);
    await sweep(t, false);
    const before = await snapshot(t);
    const { rebuild, ...counts } = await sweep(t, false);
    expect(counts).toEqual({ dryRun: false, ...ZERO });
    expect(rebuild).toBeDefined();
    expect(await snapshot(t)).toEqual(before);
  });

  // A run that died after its deletes but before its rebuild leaves stale
  // product keys in card_sets; the retry has nothing to delete and must
  // still re-derive them.
  test("a retry with nothing left to delete repairs a stale set index", async () => {
    const t = newTest();
    await seed(t);
    await sweep(t, false);
    const stale = await t.run(async (ctx) => (await ctx.db.query("card_sets").collect())[0]);
    if (stale === undefined) throw new Error("seed built no card_sets");
    await t.run(async (ctx) => ctx.db.patch(stale._id, { product_keys: [...stale.product_keys, "tc:999999"] }));
    await sweep(t, false);
    const sets = await t.run(async (ctx) => ctx.db.query("card_sets").collect());
    for (const s of sets) for (const k of s.product_keys) expect(k).toMatch(/^(en|jp|cn):/);
  });

  test("printings on a retired site are counted, never deleted", async () => {
    const t = newTest();
    await seed(t);
    await t.run(async (ctx) => {
      for (const [key, site] of [["prt_left1", "asia-en"], ["prt_left2", "tc"], ["prt_live", "en"]] as const) {
        await ctx.db.insert("printings", {
          key,
          card_key: "card_x",
          rarity: "C",
          source_text: "s",
          block_icon: 1,
          first_seen_at: SEEN,
          site,
          variant: "base",
          image_url: "https://example.com/x.png",
        });
      }
    });
    expect((await sweep(t, true)).printings_remaining).toBe(2);
    expect((await sweep(t, false)).printings_remaining).toBe(2);
    expect((await snapshot(t)).printings).toEqual({ "asia-en": 1, tc: 1, en: 1 });
  });

  test("refuses while the newest sync is running", async () => {
    const t = newTest();
    await seed(t);
    await t.run(async (ctx) => {
      const sync = { data_commit: "a".repeat(40), manifest_sha256: "x" };
      await ctx.db.insert("data_syncs", { ...sync, started_at: "2026-10-09T00:00:00Z", finished_at: "2026-10-09T00:05:00Z", status: "ok" });
      await ctx.db.insert("data_syncs", { ...sync, started_at: "2026-10-10T00:00:00Z", status: "running" });
    });
    await expect(sweep(t, false)).rejects.toThrow(/site sweep refused: .* is running/);
    await expect(sweep(t, true)).rejects.toThrow(/site sweep refused/);
    expect(await snapshot(t)).toEqual(SEEDED);
  });

  test("sweeps a retired table that spans more than one page", async () => {
    const t = newTest();
    await seed(t);
    const extra = SCAN_PAGE + 50;
    await t.run(async (ctx) => {
      for (let i = 0; i < extra; i++) await insertObservation(ctx, i % 2 ? "tc" : "asia-en", `card_${i}`);
    });
    expect((await sweep(t, true)).card_observations).toBe(extra + 2);
    expect((await sweep(t, false)).card_observations).toBe(extra + 2);
    expect((await snapshot(t)).card_observations).toEqual(without(SEEDED.card_observations));
  });
});
