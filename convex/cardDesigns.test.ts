/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";

// The card page grouped by design, and the counts the tile shows. Designs and
// printing_designs are seeded by hand: the data repo mints them.

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const T = "2026-10-15T00:00:00Z";
const ROBIN = "card_0000000000aa";
const OTHER = "card_0000000000bb";

type Site = Doc<"printings">["site"];

function card(key: string) {
  return {
    key,
    number: key === ROBIN ? "OP01-017" : "OP01-018",
    category: "character" as const,
    colors: ["red" as const],
    attributes: ["wisdom" as const],
    facts_site: "en" as const,
    first_seen_at: T,
  };
}

function printing(key: string, site: Site, variant: "base" | "parallel" | "stamped" = "base", cardKey = ROBIN) {
  return {
    key,
    card_key: cardKey,
    site,
    rarity: "R",
    variant,
    image_url: `https://example.test/${site}/${key}.png`,
    source_text: "",
    block_icon: null,
    first_seen_at: T,
  };
}

function design(key: string, stamp: string | null = null, exclusive_override: boolean | null = null, cardKey = ROBIN) {
  return { key, card_key: cardKey, stamp, exclusive_override };
}

function member(printingKey: string, designKey: string) {
  return { key: printingKey, printing_key: printingKey, design_key: designKey, method: "manual" as const };
}

type Seed = {
  printings: ReturnType<typeof printing>[];
  designs?: ReturnType<typeof design>[];
  members?: [string, string][];
};

async function seeded({ printings, designs = [], members = [] }: Seed) {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("cards", card(ROBIN));
    await ctx.db.insert("cards", card(OTHER));
    // printings is a union by site; the cast only bridges the shared helper.
    for (const p of printings) await ctx.db.insert("printings", p as never);
    for (const d of designs) await ctx.db.insert("designs", d);
    for (const [p, d] of members) await ctx.db.insert("printing_designs", member(p, d));
  });
  return t;
}

async function detail(t: Awaited<ReturnType<typeof seeded>>, lang?: "en" | "ja" | "zh" | "ko" | "fr") {
  const res = await t.query(api.cards.detail, { key: ROBIN, lang });
  if (!res) throw new Error("no card");
  return res;
}

const keys = (regions: { language: string; printings: { key: string }[] }[]) =>
  regions.map((r) => [r.language, r.printings.map((p) => p.key)]);

describe("cards.detail designs", () => {
  test("no design rows: no designs, every printing unreviewed in today's regions", async () => {
    const t = await seeded({ printings: [printing("prt_en_1", "en"), printing("prt_jp_1", "jp")] });
    const res = await detail(t);
    expect(res.designs).toEqual([]);
    expect(res.unreviewed).toEqual(res.regions);
    expect(res.counts).toEqual({ designs: 0, languages: 2, unreviewed: 2 });
  });

  test("printings group by design and language, unstamped first, the rest unreviewed", async () => {
    const t = await seeded({
      printings: [
        printing("prt_en_0", "en"),
        printing("prt_en_1", "en"),
        printing("prt_en_2", "en", "parallel"),
        printing("prt_jp_1", "jp"),
        printing("prt_tc_1", "tcgcsv", "stamped"),
        printing("prt_cn_1", "cn"),
      ],
      // The stamped design's prt_en_0 sorts first of all: unstamped still leads.
      designs: [design("dsn_stamp", "Release Event"), design("dsn_base")],
      members: [
        ["prt_en_0", "dsn_stamp"],
        ["prt_tc_1", "dsn_stamp"],
        ["prt_en_1", "dsn_base"],
        ["prt_jp_1", "dsn_base"],
      ],
    });
    const res = await detail(t);
    expect(res.designs.map((d) => [d.key, d.stamp, keys(d.regions)])).toEqual([
      ["dsn_base", null, [["en", ["prt_en_1"]], ["jp", ["prt_jp_1"]]]],
      ["dsn_stamp", "Release Event", [["en", ["prt_en_0", "prt_tc_1"]]]],
    ]);
    expect(keys(res.unreviewed)).toEqual([
      ["en", ["prt_en_2"]],
      ["cn", ["prt_cn_1"]],
    ]);
    expect(res.counts).toEqual({ designs: 2, languages: 3, unreviewed: 2 });
    // regions still carries every printing, designs or not.
    expect(res.regions.flatMap((r) => r.printings).length).toBe(6);
  });

  test("a row naming another card's design leaves the printing unreviewed", async () => {
    const t = await seeded({
      printings: [printing("prt_en_1", "en")],
      designs: [design("dsn_other", null, null, OTHER)],
      members: [["prt_en_1", "dsn_other"]],
    });
    const res = await detail(t);
    expect(res.designs).toEqual([]);
    expect(res.counts).toEqual({ designs: 0, languages: 1, unreviewed: 1 });
  });

  describe("exclusive", () => {
    test("PIN: an en design with an unreviewed jp printing gets no star", async () => {
      const t = await seeded({
        printings: [printing("prt_en_1", "en"), printing("prt_jp_1", "jp")],
        designs: [design("dsn_en")],
        members: [["prt_en_1", "dsn_en"]],
      });
      expect((await detail(t)).designs.map((d) => d.exclusive)).toEqual([null]);
    });

    test("PIN: the same card with the jp printing reviewed into its own design stars both", async () => {
      const t = await seeded({
        printings: [printing("prt_en_1", "en"), printing("prt_jp_1", "jp")],
        designs: [design("dsn_en"), design("dsn_jp")],
        members: [
          ["prt_en_1", "dsn_en"],
          ["prt_jp_1", "dsn_jp"],
        ],
      });
      expect((await detail(t)).designs.map((d) => [d.key, d.exclusive])).toEqual([
        ["dsn_en", "en"],
        ["dsn_jp", "jp"],
      ]);
    });

    test("an unreviewed printing holds back only the designs that lack its language", async () => {
      const t = await seeded({
        printings: [printing("prt_en_1", "en"), printing("prt_en_2", "en", "parallel"), printing("prt_jp_1", "jp")],
        designs: [design("dsn_en"), design("dsn_jp")],
        members: [
          ["prt_en_1", "dsn_en"],
          ["prt_jp_1", "dsn_jp"],
        ],
      });
      // The unreviewed en parallel could still be dsn_jp's art in English, so
      // dsn_jp waits; dsn_en already has English and keeps its star.
      expect((await detail(t)).designs.map((d) => d.exclusive)).toEqual(["en", null]);
    });

    test("no star on a design in two languages, or on a card printed in one", async () => {
      const both = await seeded({
        printings: [printing("prt_en_1", "en"), printing("prt_jp_1", "jp")],
        designs: [design("dsn_both")],
        members: [
          ["prt_en_1", "dsn_both"],
          ["prt_jp_1", "dsn_both"],
        ],
      });
      expect((await detail(both)).designs.map((d) => d.exclusive)).toEqual([null]);
      // tcgcsv is English, so en plus tcgcsv is one language: nothing to be exclusive of.
      const english = await seeded({
        printings: [printing("prt_en_1", "en"), printing("prt_tc_1", "tcgcsv", "stamped")],
        designs: [design("dsn_en"), design("dsn_stamp", "Release Event")],
        members: [
          ["prt_en_1", "dsn_en"],
          ["prt_tc_1", "dsn_stamp"],
        ],
      });
      expect((await detail(english)).designs.map((d) => d.exclusive)).toEqual([null, null]);
    });

    test("an override wins both ways", async () => {
      const t = await seeded({
        printings: [printing("prt_en_1", "en"), printing("prt_en_2", "en", "parallel"), printing("prt_jp_1", "jp")],
        designs: [design("dsn_true", null, true), design("dsn_false", "Stamp", false)],
        members: [
          ["prt_en_1", "dsn_true"],
          ["prt_en_2", "dsn_false"],
        ],
      });
      // dsn_true: jp is unreviewed, so derived would be no star; the override stars it.
      // dsn_false: derived the same, and false keeps it off.
      expect((await detail(t)).designs.map((d) => [d.key, d.exclusive])).toEqual([
        ["dsn_true", "en"],
        ["dsn_false", null],
      ]);
      const reviewed = await seeded({
        printings: [printing("prt_en_1", "en"), printing("prt_jp_1", "jp")],
        designs: [design("dsn_en", null, false), design("dsn_jp")],
        members: [
          ["prt_en_1", "dsn_en"],
          ["prt_jp_1", "dsn_jp"],
        ],
      });
      // Derived would star dsn_en; false turns it off and leaves dsn_jp derived.
      expect((await detail(reviewed)).designs.map((d) => d.exclusive)).toEqual([null, "jp"]);
    });
  });

  test("the default language is the first in the reader's site order the design has", async () => {
    const t = await seeded({
      printings: [printing("prt_en_1", "en"), printing("prt_jp_1", "jp"), printing("prt_cn_1", "cn"), printing("prt_jp_2", "jp", "parallel"), printing("prt_cn_2", "cn", "parallel")],
      designs: [design("dsn_all"), design("dsn_asia", "Stamp")],
      members: [
        ["prt_en_1", "dsn_all"],
        ["prt_jp_1", "dsn_all"],
        ["prt_cn_1", "dsn_all"],
        ["prt_jp_2", "dsn_asia"],
        ["prt_cn_2", "dsn_asia"],
      ],
    });
    const defaults = async (lang: "en" | "ja" | "zh" | "ko" | "fr") =>
      (await detail(t, lang)).designs.map((d) => d.defaultLanguage);
    expect(await defaults("en")).toEqual(["en", "jp"]);
    expect(await defaults("ja")).toEqual(["jp", "jp"]);
    expect(await defaults("zh")).toEqual(["cn", "cn"]);
    expect(await defaults("ko")).toEqual(["en", "jp"]);
    expect(await defaults("fr")).toEqual(["en", "jp"]);
  });
});

describe("design counts on the tile", () => {
  async function summarized(seed: Seed) {
    const t = await seeded(seed);
    await t.mutation(internal.cardSummary.batch, { cursor: null });
    const res = await t.query(api.cards.browse, { paginationOpts: { numItems: 10, cursor: null } });
    return res.page.find((c) => c.key === ROBIN);
  }

  test("no design rows: the tile keeps the printing count alone", async () => {
    const row = await summarized({ printings: [printing("prt_en_1", "en"), printing("prt_jp_1", "jp")] });
    expect(row?.printings).toBe(2);
    expect(row?.designs).toBeNull();
  });

  test("mixed reviewed and unreviewed, tcgcsv counted as English", async () => {
    const row = await summarized({
      printings: [
        printing("prt_en_1", "en"),
        printing("prt_tc_1", "tcgcsv", "stamped"),
        printing("prt_jp_1", "jp"),
        printing("prt_cn_1", "cn"),
      ],
      designs: [design("dsn_base"), design("dsn_stamp", "Release Event")],
      members: [
        ["prt_en_1", "dsn_base"],
        ["prt_jp_1", "dsn_base"],
        ["prt_tc_1", "dsn_stamp"],
      ],
    });
    expect(row?.designs).toEqual({ designs: 2, languages: 3, unreviewed: 1 });
  });

  test("PIN: a card whose only printings are tcgcsv and en counts one language", async () => {
    const row = await summarized({
      printings: [printing("prt_en_1", "en"), printing("prt_tc_1", "tcgcsv", "stamped")],
      designs: [design("dsn_en")],
      members: [["prt_en_1", "dsn_en"]],
    });
    expect(row?.designs).toEqual({ designs: 1, languages: 1, unreviewed: 1 });
  });

  test("the live read (no summary yet) counts the same", async () => {
    const t = await seeded({
      printings: [printing("prt_en_1", "en"), printing("prt_tc_1", "tcgcsv", "stamped")],
      designs: [design("dsn_en")],
      members: [["prt_en_1", "dsn_en"]],
    });
    const res = await t.query(api.cards.browse, { paginationOpts: { numItems: 10, cursor: null } });
    expect(res.page.find((c) => c.key === ROBIN)?.designs).toEqual({ designs: 1, languages: 1, unreviewed: 1 });
  });

  test("a design row arriving after a pass changes the summary on the next", async () => {
    const t = await seeded({ printings: [printing("prt_en_1", "en"), printing("prt_jp_1", "jp")] });
    await t.mutation(internal.cardSummary.batch, { cursor: null });
    await t.run(async (ctx) => {
      await ctx.db.insert("designs", design("dsn_en"));
      await ctx.db.insert("printing_designs", member("prt_en_1", "dsn_en"));
    });
    const { changed } = await t.mutation(internal.cardSummary.batch, { cursor: null });
    expect(changed).toBe(1);
    const res = await t.query(api.cards.browse, { paginationOpts: { numItems: 10, cursor: null } });
    expect(res.page.find((c) => c.key === ROBIN)?.designs).toEqual({ designs: 1, languages: 2, unreviewed: 1 });
  });

  test("splitting a design changes the summary though no other count moves", async () => {
    const t = await seeded({
      printings: [printing("prt_en_1", "en"), printing("prt_tc_1", "tcgcsv", "stamped")],
      designs: [design("dsn_a"), design("dsn_b", "Release Event")],
      members: [
        ["prt_en_1", "dsn_a"],
        ["prt_tc_1", "dsn_a"],
      ],
    });
    await t.mutation(internal.cardSummary.batch, { cursor: null });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("printing_designs")
        .withIndex("by_printing", (q) => q.eq("printing_key", "prt_tc_1"))
        .unique();
      await ctx.db.patch(row!._id, { design_key: "dsn_b" });
    });
    const { changed } = await t.mutation(internal.cardSummary.batch, { cursor: null });
    expect(changed).toBe(1);
    const res = await t.query(api.cards.browse, { paginationOpts: { numItems: 10, cursor: null } });
    expect(res.page.find((c) => c.key === ROBIN)?.designs).toEqual({ designs: 2, languages: 1, unreviewed: 0 });
  });

  test("a summary stored before design counts is rewritten once", async () => {
    const t = await seeded({ printings: [printing("prt_en_1", "en")] });
    await t.run(async (ctx) => {
      const c = await ctx.db
        .query("cards")
        .withIndex("by_key", (q) => q.eq("key", ROBIN))
        .unique();
      await ctx.db.patch(c!._id, {
        summary: { name: null, names: {}, printings: 1, image_url: "https://example.test/en/prt_en_1.png" },
      });
    });
    const first = await t.mutation(internal.cardSummary.batch, { cursor: null });
    const second = await t.mutation(internal.cardSummary.batch, { cursor: null });
    // ROBIN rewritten for its counts, OTHER written for the first time; then nothing.
    expect([first.changed, second.changed]).toEqual([2, 0]);
  });
});
