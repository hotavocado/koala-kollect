/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { SEARCH_LIMIT } from "./cardSearchCore";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const T = "2026-10-08T00:00:00Z";

type Site = "en" | "jp";

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

function observation(cardKey: string, site: Site, name: string, superseded_at?: string) {
  const hash = `${site}${name}`.length.toString(16).padStart(16, "0");
  return {
    key: `${cardKey}:${site}:${hash}${superseded_at ? "x" : ""}`,
    card_key: cardKey,
    site,
    lang: site === "en" ? ("en" as const) : ("ja" as const),
    observation_hash: hash,
    name,
    category: "character" as const,
    colors: ["red" as const],
    attributes: ["strike" as const],
    types: ["Straw Hat Crew"],
    first_seen_at: T,
    ...(superseded_at ? { superseded_at } : {}),
  };
}

// Zoro OP01-001 and Luffy OP01-003 in English and Japanese, plus Sanji P-034.
async function seed() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const [key, number, en, jp] of [
      ["card_zoro", "OP01-001", "Roronoa Zoro", "ロロノア・ゾロ"],
      ["card_luffy", "OP01-003", "Monkey.D.Luffy", "モンキー・D・ルフィ"],
      ["card_sanji", "P-034", "Sanji", "サンジ"],
    ]) {
      await ctx.db.insert("cards", card(key, number));
      await ctx.db.insert("card_observations", observation(key, "en", en));
      await ctx.db.insert("card_observations", observation(key, "jp", jp));
    }
  });
  return t;
}

const numbers = (r: { hits: { number: string | null }[] }) => r.hits.map((h) => h.number);

describe("search", () => {
  test("a blank query returns nothing", async () => {
    const t = await seed();
    expect(await t.query(api.cardSearch.search, { q: "   " })).toEqual({ kind: "empty", hits: [] });
  });

  test("a whole number finds that card, typed any way", async () => {
    const t = await seed();
    for (const q of ["OP01-001", "op01001", "op1-1"]) {
      const r = await t.query(api.cardSearch.search, { q });
      expect(r.kind).toBe("number");
      expect(numbers(r)).toEqual(["OP01-001"]);
    }
    expect(numbers(await t.query(api.cardSearch.search, { q: "p34" }))).toEqual(["P-034"]);
  });

  test("a partial number lists by prefix in number order", async () => {
    const t = await seed();
    expect(numbers(await t.query(api.cardSearch.search, { q: "op01" }))).toEqual(["OP01-001", "OP01-003"]);
  });

  test("the exact match leads, then the rest of the prefix", async () => {
    const t = await convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const n of ["P-003", "P-030", "P-031"]) await ctx.db.insert("cards", card(`card_${n}`, n));
    });
    // "P-3" pads to P-003 for the exact try and lists P-3xx after it; there is
    // none, so only the exact match comes back. "P-03" lists P-030 and P-031.
    expect(numbers(await t.query(api.cardSearch.search, { q: "P-3" }))).toEqual(["P-003"]);
    expect(numbers(await t.query(api.cardSearch.search, { q: "P-03" }))).toEqual(["P-003", "P-030", "P-031"]);
  });

  test("a name finds the card and shows its English name", async () => {
    const t = await seed();
    const r = await t.query(api.cardSearch.search, { q: "zoro" });
    expect(r.kind).toBe("name");
    expect(r.hits.map((h) => [h.number, h.name, h.matchedName])).toEqual([["OP01-001", "Roronoa Zoro", null]]);
  });

  test("a Japanese name says which printed name matched", async () => {
    const t = await seed();
    const r = await t.query(api.cardSearch.search, { q: "モンキー・D・ルフィ" });
    expect(r.hits.map((h) => [h.number, h.name, h.matchedName])).toEqual([
      ["OP01-003", "Monkey.D.Luffy", "モンキー・D・ルフィ"],
    ]);
  });

  test("a card matched on several sites comes back once", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("card_observations", observation("card_zoro", "en", "Roronoa Zoro", T));
    });
    expect(numbers(await t.query(api.cardSearch.search, { q: "roronoa" }))).toEqual(["OP01-001"]);
  });

  test("a number-shaped query with no number match falls back to names", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", card("card_perona", "OP06-093"));
      await ctx.db.insert("card_observations", observation("card_perona", "en", "St1 Perona"));
    });
    // "P-" parses as a promo prefix; P-034 matches it, so it stays a number search.
    expect((await t.query(api.cardSearch.search, { q: "P-" })).kind).toBe("number");
    // "st1" parses as a number prefix that matches no number, so names answer it.
    const r = await t.query(api.cardSearch.search, { q: "st1" });
    expect([r.kind, numbers(r)]).toEqual(["name", ["OP06-093"]]);
    // Nothing anywhere: still a name search, with no hits.
    expect(await t.query(api.cardSearch.search, { q: "OP99" })).toEqual({ kind: "name", hits: [] });
  });

  test("one letter is too short for a name search", async () => {
    const t = await seed();
    expect(await t.query(api.cardSearch.search, { q: "z" })).toEqual({ kind: "empty", hits: [] });
  });

  test("results stop at the limit", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 1; i <= SEARCH_LIMIT + 5; i++) {
        const n = `OP02-${String(i).padStart(3, "0")}`;
        await ctx.db.insert("cards", card(`card_${n}`, n));
        await ctx.db.insert("card_observations", observation(`card_${n}`, "en", "Nami"));
      }
    });
    expect((await t.query(api.cardSearch.search, { q: "op02" })).hits).toHaveLength(SEARCH_LIMIT);
    expect((await t.query(api.cardSearch.search, { q: "nami" })).hits).toHaveLength(SEARCH_LIMIT);
  });
});
