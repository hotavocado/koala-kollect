/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const T = "2026-10-08T00:00:00Z";
const PAGE = { numItems: 24, cursor: null };

const zoro = {
  key: "card_0a1b2c3d4e5f",
  number: "OP01-001",
  category: "leader" as const,
  colors: ["red" as const],
  attributes: ["strike" as const],
  facts_site: "jp" as const,
  first_seen_at: T,
};

const OBS_LANG = { en: "en", jp: "ja", cn: "zh-Hans" } as const;

function observation(site: "en" | "jp" | "cn", name: string, superseded_at?: string) {
  return {
    key: `${zoro.key}:${site}:${name.length.toString(16).padStart(16, "0")}`,
    card_key: zoro.key,
    site,
    lang: OBS_LANG[site],
    observation_hash: name.length.toString(16).padStart(16, "0"),
    name,
    category: "leader" as const,
    colors: ["red" as const],
    attributes: ["slash" as const],
    types: ["Straw Hat Crew"],
    first_seen_at: T,
    ...(superseded_at ? { superseded_at } : {}),
  };
}

function printing(key: string, site: "en" | "jp", variant: "base" | "parallel") {
  return {
    key,
    card_key: zoro.key,
    site,
    rarity: "L",
    variant,
    image_url: `https://example.test/${site}/${key}.png`,
    source_text: "-ROMANCE DAWN- [OP-01]",
    block_icon: null,
    first_seen_at: T,
  };
}

describe("cards.browse", () => {
  test("an empty database reads as an exhausted empty page", async () => {
    const t = convexTest(schema, modules);
    const res = await t.query(api.cards.browse, { paginationOpts: PAGE });
    expect(res.page).toEqual([]);
    expect(res.isDone).toBe(true);
  });

  test("a card reads its English name and a base printing's image", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", zoro);
      await ctx.db.insert("card_observations", observation("jp", "ロロノア・ゾロ"));
      await ctx.db.insert("card_observations", observation("en", "Roronoa Zoro"));
      // A parallel on the preferred site loses to a base on any site.
      await ctx.db.insert("printings", printing("prt_000000000001", "en", "parallel"));
      await ctx.db.insert("printings", printing("prt_000000000002", "jp", "base"));
    });
    const res = await t.query(api.cards.browse, { paginationOpts: PAGE });
    expect(res.page).toEqual([
      {
        key: zoro.key,
        number: "OP01-001",
        donDesign: null,
        category: "leader",
        colors: ["red"],
        name: "Roronoa Zoro",
        nameSite: "en",
        imageUrl: "https://example.test/jp/prt_000000000002.png",
        printings: 2,
        designs: null,
      },
    ]);
  });

  test("a superseded observation is never the shown name", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", zoro);
      await ctx.db.insert("card_observations", observation("en", "Zoro (old)", T));
      await ctx.db.insert("card_observations", observation("jp", "ロロノア・ゾロ"));
    });
    const res = await t.query(api.cards.browse, { paginationOpts: PAGE });
    expect(res.page[0].name).toBe("ロロノア・ゾロ");
    expect(res.page[0].imageUrl).toBeNull();
  });

  test("a DON card with no observation reads with no name and no number", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", {
        key: "card_d0d0d0d0d0d0",
        don_design: "OP-01:monkey-d-luffy",
        category: "don",
        colors: [],
        attributes: [],
        facts_site: "tcgcsv",
        first_seen_at: T,
      });
    });
    const res = await t.query(api.cards.browse, { paginationOpts: PAGE });
    expect(res.page[0]).toMatchObject({
      category: "don",
      number: null,
      donDesign: "OP-01:monkey-d-luffy",
      name: null,
    });
  });

  test("a DON card reads its tcgcsv name and its normal printing's image over gold", async () => {
    const t = convexTest(schema, modules);
    const C = "card_d0d0d0d0d0d0";
    const img = (id: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_1000x1000.jpg`;
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", {
        key: C,
        don_design: "OP-01:monkey-d-luffy",
        category: "don",
        colors: [],
        attributes: [],
        facts_site: "tcgcsv",
        first_seen_at: T,
      });
      await ctx.db.insert("card_observations", {
        key: `${C}:tcgcsv:0d0d0d0d0d0d0d0d`,
        card_key: C,
        site: "tcgcsv",
        lang: "en",
        observation_hash: "0d0d0d0d0d0d0d0d",
        name: "DON!! Card (Monkey.D.Luffy)",
        category: "don",
        colors: [],
        attributes: [],
        types: [],
        first_seen_at: T,
      });
      // Gold inserted first, so insertion order alone would pick its image.
      for (const [key, variant, id] of [
        ["prt_00000000d0d1", "gold", 512345],
        ["prt_00000000d0d2", "normal", 512344],
      ] as const) {
        await ctx.db.insert("printings", {
          key,
          card_key: C,
          site: "tcgcsv",
          rarity: "DON",
          variant,
          image_url: img(id),
          source_text: "",
          block_icon: null,
          first_seen_at: T,
        });
      }
    });
    const res = await t.query(api.cards.browse, { paginationOpts: PAGE });
    expect(res.page[0]).toMatchObject({ name: "DON!! Card (Monkey.D.Luffy)", imageUrl: img(512344), printings: 2 });
  });
});

describe("the reader's language", () => {
  const NAMES = { en: "Roronoa Zoro", jp: "ロロノア・ゾロ", cn: "罗罗诺亚·索隆" } as const;

  // Zoro with a current observation on each listed site, each with its own
  // types and effect, so a mixed-up text block shows.
  async function seeded(sites: ("en" | "jp" | "cn")[]) {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", zoro);
      for (const site of sites) {
        await ctx.db.insert("card_observations", {
          ...observation(site, NAMES[site]),
          types: [`types-${site}`],
          effect: `effect-${site}`,
        });
      }
    });
    return t;
  }

  async function shownName(t: ReturnType<typeof convexTest>, lang?: "en" | "ja" | "zh" | "ko" | "fr") {
    const res = await t.query(api.cards.browse, { paginationOpts: PAGE, ...(lang ? { lang } : {}) });
    return [res.page[0].name, res.page[0].nameSite];
  }

  test("each language reads its own site's name, ko and fr read English, no lang reads English", async () => {
    const t = await seeded(["en", "jp", "cn"]);
    expect(await shownName(t, "ja")).toEqual([NAMES.jp, "jp"]);
    expect(await shownName(t, "zh")).toEqual([NAMES.cn, "cn"]);
    expect(await shownName(t, "fr")).toEqual([NAMES.en, "en"]);
    expect(await shownName(t, "ko")).toEqual([NAMES.en, "en"]);
    expect(await shownName(t, "en")).toEqual([NAMES.en, "en"]);
    expect(await shownName(t)).toEqual([NAMES.en, "en"]);
  });

  test("a language the card lacks falls through to English, then the card's own", async () => {
    // No jp: a Japanese reader gets English, not Chinese.
    expect(await shownName(await seeded(["en", "cn"]), "ja")).toEqual([NAMES.en, "en"]);
    // No English: an English or French reader gets jp before cn.
    const t = await seeded(["jp", "cn"]);
    expect(await shownName(t, "en")).toEqual([NAMES.jp, "jp"]);
    expect(await shownName(t, "fr")).toEqual([NAMES.jp, "jp"]);
    // cn only: every reader gets the card's own.
    expect(await shownName(await seeded(["cn"]), "ja")).toEqual([NAMES.cn, "cn"]);
  });

  test("the card page's whole text block and the print page's name follow it", async () => {
    const t = await seeded(["en", "jp", "cn"]);
    await t.run(async (ctx) => {
      await ctx.db.insert("printings", printing("prt_000000000001", "en", "base"));
      await ctx.db.insert("printings", printing("prt_000000000002", "jp", "base"));
    });
    const card = await t.query(api.cards.detail, { key: zoro.key, lang: "ja" });
    expect(card?.text).toEqual({
      site: "jp",
      name: NAMES.jp,
      types: ["types-jp"],
      effect: "effect-jp",
      trigger: null,
    });
    // The image follows the same order: jp's base, not en's.
    expect(card?.imageUrl).toBe("https://example.test/jp/prt_000000000002.png");
    expect((await t.query(api.cards.detail, { key: zoro.key }))?.text?.site).toBe("en");
    const print = await t.query(api.cards.print, { cardKey: zoro.key, printKey: "prt_000000000001", lang: "zh" });
    expect(print?.card).toMatchObject({ name: NAMES.cn, nameSite: "cn" });
  });
});

describe("cards.lastSync", () => {
  test("no sync yet reads null, then the newest attempt wins", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.cards.lastSync, {})).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.insert("data_syncs", {
        data_commit: "a".repeat(40),
        manifest_sha256: "",
        started_at: "2026-10-08T06:00:00Z",
        finished_at: "2026-10-08T06:00:01Z",
        status: "ok",
        upserted: 12,
      });
      await ctx.db.insert("data_syncs", {
        data_commit: "b".repeat(40),
        manifest_sha256: "",
        started_at: "2026-10-08T07:00:00Z",
        finished_at: "2026-10-08T07:00:01Z",
        status: "refused",
        refusal: "manifest.json not found",
      });
    });
    expect(await t.query(api.cards.lastSync, {})).toEqual({
      status: "refused",
      startedAt: "2026-10-08T07:00:00Z",
      finishedAt: "2026-10-08T07:00:01Z",
      upserted: null,
    });
  });
});
