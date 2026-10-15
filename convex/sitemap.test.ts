/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { SitemapCard } from "./sitemap";

// The sitemap lists only what renders: every card key it gives reads a card
// from cards.detail, and every print a printing from cards.print. A printing
// whose card is gone renders nothing, so it is not listed, and neither is the
// card key it points at.

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const T = "2026-10-15T00:00:00Z";
const ZORO = "card_0a1b2c3d4e5f";
const GONE = "card_ffffffffffff"; // no cards row

function card(key: string, number: string) {
  return {
    key,
    number,
    category: "leader" as const,
    colors: ["red" as const],
    attributes: [],
    facts_site: "jp" as const,
    first_seen_at: T,
  };
}

function printing(key: string, cardKey: string) {
  return {
    key,
    card_key: cardKey,
    site: "jp" as const,
    rarity: "L",
    variant: "base" as const,
    image_url: `https://example.test/${key}.png`,
    source_text: `source ${key}`,
    block_icon: null,
    first_seen_at: T,
  };
}

async function listAll(t: ReturnType<typeof convexTest>, numItems = 100): Promise<SitemapCard[]> {
  const all: SitemapCard[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: { page: SitemapCard[]; isDone: boolean; continueCursor: string } = await t.query(
      api.sitemap.cards,
      { paginationOpts: { numItems, cursor } },
    );
    all.push(...page.page);
    if (page.isDone) return all;
    cursor = page.continueCursor;
  }
}

describe("sitemap.cards", () => {
  test("lists a card with its prints, and each one renders", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", card(ZORO, "OP01-001"));
      await ctx.db.insert("printings", printing("prt_000000000001", ZORO));
      await ctx.db.insert("printings", printing("prt_000000000002", ZORO));
    });
    const listed = await listAll(t);
    expect(listed).toEqual([{ key: ZORO, prints: ["prt_000000000001", "prt_000000000002"] }]);
    for (const c of listed) {
      expect(await t.query(api.cards.detail, { key: c.key })).not.toBeNull();
      for (const p of c.prints) {
        expect(await t.query(api.cards.print, { cardKey: c.key, printKey: p })).not.toBeNull();
      }
    }
  });

  test("a printing whose card is gone is not listed, nor is the card it names", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", card(ZORO, "OP01-001"));
      await ctx.db.insert("printings", printing("prt_000000000001", ZORO));
      await ctx.db.insert("printings", printing("prt_00000000dead", GONE));
    });
    // Both would be not-found pages.
    expect(await t.query(api.cards.detail, { key: GONE })).toBeNull();
    expect(await t.query(api.cards.print, { cardKey: GONE, printKey: "prt_00000000dead" })).toBeNull();

    const listed = await listAll(t);
    expect(listed.map((c) => c.key)).toEqual([ZORO]);
    expect(listed.flatMap((c) => c.prints)).toEqual(["prt_000000000001"]);
  });

  test("a card with no printings is still listed: its page renders", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", card(ZORO, "OP01-001"));
    });
    expect(await listAll(t)).toEqual([{ key: ZORO, prints: [] }]);
    expect(await t.query(api.cards.detail, { key: ZORO })).not.toBeNull();
  });

  test("a page holds at most 100 cards whatever numItems asks, and paging reaches every card", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 150; i++) {
        await ctx.db.insert("cards", card(`card_${String(i).padStart(12, "0")}`, `OP01-${i}`));
      }
    });
    const first = await t.query(api.sitemap.cards, { paginationOpts: { numItems: 1000, cursor: null } });
    expect(first.page).toHaveLength(100);
    expect(first.isDone).toBe(false);
    expect(new Set((await listAll(t, 1000)).map((c) => c.key)).size).toBe(150);
  });
});
