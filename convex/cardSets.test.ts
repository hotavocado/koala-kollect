/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { ownPrefixes } from "./cards";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const T = "2026-10-08T00:00:00Z";

function card(key: string, number: string) {
  return {
    key,
    number,
    category: "character" as const,
    colors: ["red" as const],
    attributes: ["strike" as const],
    facts_site: "jp" as const,
    first_seen_at: T,
  };
}

function printing(key: string, card_key: string, site: "en" | "jp") {
  return {
    key,
    card_key,
    site,
    rarity: "C",
    variant: "base" as const,
    image_url: `https://example.test/${key}.png`,
    source_text: "",
    first_seen_at: T,
  };
}

function product(site: "en" | "jp", code: string | undefined, name: string, kind: "booster" | "promo_bucket") {
  const key = `${site}:${code ?? kind}`;
  return { key, site, series_id: key, ...(code ? { code } : {}), name, kind, first_seen_at: T };
}

function link(printing_key: string, product_key: string, removed_at?: string) {
  return {
    key: `${printing_key}@${product_key}`,
    printing_key,
    product_key,
    first_seen_at: T,
    ...(removed_at ? { removed_at } : {}),
  };
}

async function seed() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const c of [card("card_a", "OP01-010"), card("card_b", "OP01-009"), card("card_c", "P-001")]) {
      await ctx.db.insert("cards", c);
    }
    for (const p of [
      printing("prt_a_en", "card_a", "en"),
      printing("prt_a_jp", "card_a", "jp"),
      printing("prt_b_jp", "card_b", "jp"),
      printing("prt_c_en", "card_c", "en"),
      printing("prt_gone", "card_c", "jp"),
    ]) {
      await ctx.db.insert("printings", p);
    }
    for (const p of [
      product("en", "OP-01", "BOOSTER PACK -ROMANCE DAWN- [OP-01]", "booster"),
      product("jp", "OP-01", "ブースターパック ROMANCE DAWN【OP-01】", "booster"),
      product("en", undefined, "Promotion card", "promo_bucket"),
    ]) {
      await ctx.db.insert("products", p);
    }
    for (const l of [
      link("prt_a_en", "en:OP-01"),
      link("prt_a_jp", "jp:OP-01"),
      link("prt_b_jp", "jp:OP-01"),
      link("prt_c_en", "en:promo_bucket"),
      // A removed listing counts for neither the set nor its list.
      link("prt_gone", "jp:OP-01", T),
    ]) {
      await ctx.db.insert("printing_products", l);
    }
  });
  return t;
}

test("rebuild counts distinct cards per set and lists them by number", async () => {
  const t = await seed();
  expect(await t.action(internal.cardSets.rebuild, {})).toEqual({ sets: 2, pruned: 0 });

  expect(await t.query(api.cards.sets, {})).toEqual([
    { slug: "op-01", code: "OP-01", kind: "booster", title: "ROMANCE DAWN", cardCount: 2 },
    { slug: "promo", code: null, kind: "promo", title: "Promotion cards", cardCount: 1 },
  ]);

  const op01 = await t.query(api.cards.setCards, { slug: "op-01" });
  expect(op01?.cards.map((c) => c.number)).toEqual(["OP01-009", "OP01-010"]);
  expect(op01?.fromOtherSets).toEqual([]);
  expect(op01?.cards.find((c) => c.number === "OP01-010")?.printings).toBe(2);
  expect(await t.query(api.cards.setCards, { slug: "nope" })).toBeNull();
});

test("rebuild prunes a set whose products are gone", async () => {
  const t = await seed();
  await t.action(internal.cardSets.rebuild, {});
  await t.run(async (ctx) => {
    const promo = await ctx.db
      .query("products")
      .withIndex("by_key", (q) => q.eq("key", "en:promo_bucket"))
      .unique();
    await ctx.db.delete(promo!._id);
  });
  expect(await t.action(internal.cardSets.rebuild, {})).toEqual({ sets: 1, pruned: 1 });
  expect((await t.query(api.cards.sets, {})).map((s) => s.slug)).toEqual(["op-01"]);
});

test("a set's own numbers lead; cards from other sets follow", async () => {
  const t = await seed();
  await t.run(async (ctx) => {
    // An SP printing of the promo card, listed under OP-01.
    await ctx.db.insert("printings", printing("prt_c_sp", "card_c", "jp"));
    await ctx.db.insert("printing_products", link("prt_c_sp", "jp:OP-01"));
  });
  await t.action(internal.cardSets.rebuild, {});
  const op01 = await t.query(api.cards.setCards, { slug: "op-01" });
  expect(op01?.cards.map((c) => c.number)).toEqual(["OP01-009", "OP01-010"]);
  expect(op01?.fromOtherSets.map((c) => c.number)).toEqual(["P-001"]);
  // The promotion bucket has no code, so nothing in it is "from another set".
  const promo = await t.query(api.cards.setCards, { slug: "promo" });
  expect(promo?.cards.map((c) => c.number)).toEqual(["P-001"]);
  expect(promo?.fromOtherSets).toEqual([]);
});

test("a card from another set shows the printing this set lists, not its base art", async () => {
  const t = await seed();
  await t.run(async (ctx) => {
    // card_c's base art is prt_c_en (promo bucket); OP-01 lists only its parallel.
    await ctx.db.insert("printings", { ...printing("prt_c_sp", "card_c", "jp"), variant: "parallel" as const });
    await ctx.db.insert("printing_products", link("prt_c_sp", "jp:OP-01"));
  });
  await t.action(internal.cardSets.rebuild, {});
  const op01 = await t.query(api.cards.setCards, { slug: "op-01" });
  expect(op01?.fromOtherSets.map((c) => c.imageUrl)).toEqual(["https://example.test/prt_c_sp.png"]);
  // The set's own card still shows its base printing.
  expect(op01?.cards.find((c) => c.number === "OP01-010")?.imageUrl).toBe("https://example.test/prt_a_en.png");
  // Outside a set, the card keeps its base art.
  const promo = await t.query(api.cards.setCards, { slug: "promo" });
  expect(promo?.cards.map((c) => c.imageUrl)).toEqual(["https://example.test/prt_c_en.png"]);
});

test("a set made mostly of other sets' cards stays one list", async () => {
  const t = await seed();
  await t.run(async (ctx) => {
    // Two foreign cards against OP-01's two own: half own still splits.
    await ctx.db.insert("printings", printing("prt_c_sp", "card_c", "jp"));
    await ctx.db.insert("printing_products", link("prt_c_sp", "jp:OP-01"));
    await ctx.db.insert("cards", card("card_d", "ST01-001"));
    await ctx.db.insert("printings", printing("prt_d", "card_d", "jp"));
    await ctx.db.insert("printing_products", link("prt_d", "jp:OP-01"));
  });
  await t.action(internal.cardSets.rebuild, {});
  expect((await t.query(api.cards.setCards, { slug: "op-01" }))?.fromOtherSets).toHaveLength(2);

  // A third foreign card makes own cards the minority: one list, number order.
  await t.run(async (ctx) => {
    await ctx.db.insert("cards", card("card_e", "ST02-001"));
    await ctx.db.insert("printings", printing("prt_e", "card_e", "jp"));
    await ctx.db.insert("printing_products", link("prt_e", "jp:OP-01"));
  });
  const op01 = await t.query(api.cards.setCards, { slug: "op-01" });
  expect(op01?.cards.map((c) => c.number)).toEqual(["OP01-009", "OP01-010", "P-001", "ST01-001", "ST02-001"]);
  expect(op01?.fromOtherSets).toEqual([]);
});

test("own prefixes", () => {
  expect(ownPrefixes("OP-10")).toEqual(["OP10"]);
  expect(ownPrefixes("PRB-01")).toEqual(["PRB01"]);
  expect(ownPrefixes("OP14-EB04")).toEqual(["OP14", "EB04"]);
  expect(ownPrefixes(null)).toEqual([]);
});
