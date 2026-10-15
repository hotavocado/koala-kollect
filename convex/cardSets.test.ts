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
    block_icon: null,
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
      { ...product("en", "OP-01", "BOOSTER PACK -ROMANCE DAWN- [OP-01]", "booster"), release_date: "2022-12-02" },
      { ...product("jp", "OP-01", "ブースターパック ROMANCE DAWN【OP-01】", "booster"), release_date: "2022-07-22" },
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
    {
      slug: "op-01",
      code: "OP-01",
      kind: "booster",
      title: "Romance Dawn",
      cardCount: 2,
      releaseDate: "2022-12-02",
      releaseSite: "en",
    },
    {
      slug: "promo",
      code: null,
      kind: "promo",
      title: "Promotion cards",
      cardCount: 1,
      releaseDate: null,
      releaseSite: null,
    },
  ]);

  const op01 = await t.query(api.cards.setCards, { slug: "op-01" });
  expect(op01?.cards.map((c) => c.number)).toEqual(["OP01-009", "OP01-010"]);
  expect(op01?.fromOtherSets).toEqual([]);
  expect(op01?.cards.find((c) => c.number === "OP01-010")?.printings).toBe(2);
  expect(await t.query(api.cards.setCards, { slug: "nope" })).toBeNull();
});

// The data repo mints a product from a print's source text for its origin. It
// has no series page, so it makes no set: a dated one added ahead of the bucket
// leaves the promo set's products, title and missing date as they were.
test("a product minted from source text joins no set, dated or not", async () => {
  const t = await seed();
  await t.run(async (ctx) => {
    await ctx.db.insert("products", {
      key: "en:src_0123456789ab",
      site: "en",
      name: "Playmat and Storage Box Set -Nami-",
      kind: "promo_bucket",
      release_date: "2024-05-01",
      release_date_source: "https://example.test/nami",
      first_seen_at: T,
    });
    await ctx.db.insert("printing_products", link("prt_c_en", "en:src_0123456789ab"));
  });
  expect(await t.action(internal.cardSets.rebuild, {})).toEqual({ sets: 2, pruned: 0 });
  expect((await t.query(api.cards.sets, {})).find((s) => s.slug === "promo")).toEqual({
    slug: "promo",
    code: null,
    kind: "promo",
    title: "Promotion cards",
    cardCount: 1,
    releaseDate: null,
    releaseSite: null,
  });
  const row = await t.run(async (ctx) => await ctx.db.query("card_sets").withIndex("by_slug", (q) => q.eq("slug", "promo")).unique());
  expect(row?.product_keys).toEqual(["en:promo_bucket"]);
});

test("the set index and a set page read the title in the reader's language", async () => {
  const t = await seed();
  await t.action(internal.cardSets.rebuild, {});
  const title = async (lang?: "en" | "ja" | "zh" | "ko") =>
    (await t.query(api.cards.sets, lang ? { lang } : {})).find((s) => s.slug === "op-01")?.title;
  expect(await title("ja")).toBe("ブースターパック ROMANCE DAWN");
  expect(await title("en")).toBe("Romance Dawn");
  expect(await title("ko")).toBe("Romance Dawn");
  // No cn product: English.
  expect(await title("zh")).toBe("Romance Dawn");
  expect(await title()).toBe("Romance Dawn");
  expect((await t.query(api.cards.setCards, { slug: "op-01", lang: "ja" }))?.set.title).toBe("ブースターパック ROMANCE DAWN");
});

// A row rebuilt before titles existed reads its one title; the next rebuild
// fills titles, and a later change to only one language's title still lands.
test("a rebuild fills and updates titles on a stored row", async () => {
  const t = await seed();
  await t.action(internal.cardSets.rebuild, {});
  await t.run(async (ctx) => {
    const row = await ctx.db.query("card_sets").withIndex("by_slug", (q) => q.eq("slug", "op-01")).unique();
    await ctx.db.patch(row!._id, { titles: undefined });
  });
  const ja = async () => (await t.query(api.cards.sets, { lang: "ja" })).find((s) => s.slug === "op-01")?.title;
  expect(await ja()).toBe("Romance Dawn");
  await t.action(internal.cardSets.rebuild, {});
  expect(await ja()).toBe("ブースターパック ROMANCE DAWN");

  await t.run(async (ctx) => {
    const jp = await ctx.db.query("products").withIndex("by_key", (q) => q.eq("key", "jp:OP-01")).unique();
    await ctx.db.patch(jp!._id, { name: "ブースターパック ロマンスドーン【OP-01】" });
  });
  await t.action(internal.cardSets.rebuild, {});
  expect(await ja()).toBe("ブースターパック ロマンスドーン");
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

// The first sync after this code deploys meets card_sets rows written before
// sets carried a date. The rebuild has to see a field the stored row lacks.
test("a rebuild adds a release date to a set row stored without one", async () => {
  const t = await seed();
  const dated = await t.run(async (ctx) => {
    const rows = (await ctx.db.query("products").collect()).filter((p) => p.release_date !== undefined);
    for (const p of rows) await ctx.db.patch(p._id, { release_date: undefined });
    return rows.map((p) => ({ id: p._id, release_date: p.release_date! }));
  });
  await t.action(internal.cardSets.rebuild, {});
  expect((await t.query(api.cards.sets, {})).find((s) => s.slug === "op-01")?.releaseDate).toBeNull();

  await t.run(async (ctx) => {
    for (const p of dated) await ctx.db.patch(p.id, { release_date: p.release_date });
  });
  await t.action(internal.cardSets.rebuild, {});
  const op01 = (await t.query(api.cards.sets, {})).find((s) => s.slug === "op-01");
  expect(op01?.releaseDate).toBe("2022-12-02");
  expect(op01?.releaseSite).toBe("en");
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

function don(key: string, don_design: string) {
  return {
    key,
    don_design,
    category: "don" as const,
    colors: [],
    attributes: [],
    facts_site: "tcgcsv" as const,
    first_seen_at: T,
  };
}

function donSet(key: string, don_design: string, set_slug: string, printing_keys: string[] = []) {
  return { key, printing_keys, don_design, set_slug, source: "group" as const, first_seen_at: T };
}

test("a set lists the DON cards don_sets places on it, apart from its numbered cards", async () => {
  const t = await seed();
  await t.run(async (ctx) => {
    await ctx.db.insert("cards", don("card_don_z", "OP-01:roronoa-zoro"));
    await ctx.db.insert("cards", don("card_don_l", "OP-01:monkey-d-luffy"));
    await ctx.db.insert("cards", don("card_don_p", "OP-PR:black-and-gold"));
    await ctx.db.insert("printings", {
      ...printing("prt_don_z", "card_don_z", "en"),
      site: "tcgcsv" as const,
      variant: "normal" as const,
    });
    await ctx.db.insert("don_sets", donSet("card_don_z", "OP-01:roronoa-zoro", "op-01", ["prt_don_z"]));
    await ctx.db.insert("don_sets", donSet("card_don_l", "OP-01:monkey-d-luffy", "op-01"));
    await ctx.db.insert("don_sets", donSet("card_don_p", "OP-PR:black-and-gold", "promo"));
    // A card the set already lists through its products is not listed twice.
    await ctx.db.insert("don_sets", donSet("card_a", "OP-01:listed", "op-01"));
  });
  await t.action(internal.cardSets.rebuild, {});

  const op01 = await t.query(api.cards.setCards, { slug: "op-01" });
  expect(op01?.cards.map((c) => c.number)).toEqual(["OP01-009", "OP01-010"]);
  expect(op01?.don.map((c) => c.donDesign)).toEqual(["OP-01:monkey-d-luffy", "OP-01:roronoa-zoro"]);
  expect(op01?.don.find((c) => c.key === "card_don_z")?.imageUrl).toBe("https://example.test/prt_don_z.png");

  const promo = await t.query(api.cards.setCards, { slug: "promo" });
  expect(promo?.cards.map((c) => c.number)).toEqual(["P-001"]);
  expect(promo?.don.map((c) => c.key)).toEqual(["card_don_p"]);

  // The set index counts the DON cards the page shows, once each.
  const counts = Object.fromEntries((await t.query(api.cards.sets, {})).map((s) => [s.slug, s.cardCount]));
  expect(counts).toEqual({ "op-01": 4, promo: 2 });
});

test("a set with no DON placed on it has an empty DON list", async () => {
  const t = await seed();
  await t.action(internal.cardSets.rebuild, {});
  expect((await t.query(api.cards.setCards, { slug: "op-01" }))?.don).toEqual([]);
});

// Shaped on koala-kollect-data at 653730a: en's combined OP14-EB04 booster
// carries OP-14 and EB-04, which jp and cn print as their own products.
async function seedSharedSets() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const c of [card("card_op14", "OP14-001"), card("card_eb04", "EB04-001"), card("card_re", "OP09-050")]) {
      await ctx.db.insert("cards", c);
    }
    for (const p of [
      printing("prt_op14_en", "card_op14", "en"),
      printing("prt_eb04_en", "card_eb04", "en"),
      printing("prt_re_en", "card_re", "en"),
      printing("prt_eb04_jp", "card_eb04", "jp"),
      printing("prt_op14_jp", "card_op14", "jp"),
    ]) {
      await ctx.db.insert("printings", p);
    }
    const base = { first_seen_at: T };
    for (const p of [
      { ...base, key: "en:OP-14", site: "en" as const, series_id: "en:OP-14", code: "OP-14", kind: "booster" as const, release_date: "2026-01-16", name: "BOOSTER PACK -THE AZURE SEA’S SEVEN- [OP14-EB04]" },
      { ...base, key: "en:569114", site: "en" as const, series_id: "569114", code: "OP14-EB04", kind: "booster" as const, release_date: "2026-01-16", name: "BOOSTER PACK -THE AZURE SEA’S SEVEN- [OP14-EB04]" },
      { ...base, key: "jp:550114", site: "jp" as const, series_id: "550114", code: "OP-14", kind: "booster" as const, release_date: "2025-11-22", name: "ブースターパック 蒼海の七傑【OP-14】" },
      { ...base, key: "jp:550204", site: "jp" as const, series_id: "550204", code: "EB-04", kind: "extra" as const, release_date: "2026-01-31", name: "エクストラブースター EGGHEAD CRISIS【EB-04】", name_en: "EGGHEAD CRISIS" },
    ]) {
      await ctx.db.insert("products", p);
    }
    for (const [product_key, set_key] of [
      ["en:OP-14", "OP-14"],
      ["en:569114", "OP-14"],
      ["en:569114", "EB-04"],
      ["jp:550114", "OP-14"],
      ["jp:550204", "EB-04"],
    ]) {
      await ctx.db.insert("product_sets", { key: `${product_key}@${set_key}`, product_key, set_key });
    }
    for (const l of [
      link("prt_op14_en", "en:569114"),
      link("prt_eb04_en", "en:569114"),
      link("prt_re_en", "en:569114"),
      link("prt_op14_jp", "jp:550114"),
      link("prt_eb04_jp", "jp:550204"),
    ]) {
      await ctx.db.insert("printing_products", l);
    }
    // Placed on the combined booster's old slug, before sets joined.
    await ctx.db.insert("cards", don("card_don", "OP-14:jinbe"));
    await ctx.db.insert("don_sets", donSet("card_don", "OP-14:jinbe", "op14-eb04"));
  });
  return t;
}

test("a set joins its products across languages; a shared booster's other-set cards stay off its page", async () => {
  const t = await seedSharedSets();
  expect(await t.action(internal.cardSets.rebuild, {})).toEqual({ sets: 2, pruned: 0 });

  // EB-04 holds the en booster only through product_sets: its title, kind and
  // date are jp:550204's, and the booster's OP14 card is not on its page.
  const eb04 = await t.query(api.cards.setCards, { slug: "eb-04" });
  expect(eb04?.set).toMatchObject({ code: "EB-04", kind: "extra", title: "EGGHEAD CRISIS", releaseDate: "2026-01-31", releaseSite: "jp" });
  expect(eb04?.cards.map((c) => c.number)).toEqual(["EB04-001"]);
  expect(eb04?.cards[0].printings).toBe(2);
  expect(eb04?.fromOtherSets.map((c) => c.number)).toEqual(["OP09-050"]);
  expect([...(eb04?.cards ?? []), ...(eb04?.fromOtherSets ?? [])].some((c) => c.number?.startsWith("OP14-"))).toBe(false);
  expect(eb04?.don).toEqual([]);

  const op14 = await t.query(api.cards.setCards, { slug: "op-14" });
  expect(op14?.cards.map((c) => c.number)).toEqual(["OP14-001"]);
  expect(op14?.cards[0].printings).toBe(2);
  expect(op14?.fromOtherSets.map((c) => c.number)).toEqual(["OP09-050"]);
  // The DON placed on op14-eb04 sits on OP-14, the set its old URL moves to.
  expect(op14?.don.map((c) => c.key)).toEqual(["card_don"]);

  // No page per product code any more.
  expect(await t.query(api.cards.setCards, { slug: "op14-eb04" })).toBeNull();
  const counts = Object.fromEntries((await t.query(api.cards.sets, {})).map((s) => [s.slug, s.cardCount]));
  expect(counts).toEqual({ "op-14": 3, "eb-04": 2 });
});
