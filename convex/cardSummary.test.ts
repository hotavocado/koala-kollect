/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { keepDerived, sameRecord } from "./syncCore";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const T = "2026-10-10T00:00:00Z";

afterEach(() => {
  vi.unstubAllEnvs();
});

function card(i: number) {
  return {
    key: `card_${i.toString(16).padStart(12, "0")}`,
    number: `OP01-${String(i).padStart(3, "0")}`,
    category: "character" as const,
    colors: ["red" as const],
    attributes: ["strike" as const],
    facts_site: "en" as const,
    first_seen_at: T,
  };
}

function observation(cardKey: string, name: string) {
  return {
    key: `${cardKey}:en:0000000000000001`,
    card_key: cardKey,
    site: "en" as const,
    lang: "en" as const,
    observation_hash: "0000000000000001",
    name,
    category: "character" as const,
    colors: ["red" as const],
    attributes: ["strike" as const],
    types: ["Straw Hat Crew"],
    first_seen_at: T,
  };
}

function printing(cardKey: string, key: string, variant: "base" | "parallel") {
  return {
    key,
    card_key: cardKey,
    site: "en" as const,
    rarity: "C",
    variant,
    image_url: `https://example.test/en/${key}.png`,
    source_text: "-ROMANCE DAWN- [OP-01]",
    block_icon: null,
    first_seen_at: T,
  };
}

async function runChain(t: ReturnType<typeof convexTest>) {
  vi.useFakeTimers();
  try {
    await t.action(internal.cardSummary.chain, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
}

describe("cardSummary.chain", () => {
  test("summarizes every card across several invocations, and a second pass changes nothing", async () => {
    vi.stubEnv("KK_SUMMARY_BUDGET_MS", "0");
    const t = convexTest(schema, modules);
    const first = card(1);
    await t.run(async (ctx) => {
      // 250 cards: pages of 100, so three invocations.
      for (let i = 1; i <= 250; i++) await ctx.db.insert("cards", card(i));
      await ctx.db.insert("card_observations", observation(first.key, "Nami"));
      await ctx.db.insert("printings", printing(first.key, "prt_000000000002", "parallel"));
      await ctx.db.insert("printings", printing(first.key, "prt_000000000001", "base"));
    });

    await runChain(t);

    const chains = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter((j) => j.name.includes("cardSummary")),
    );
    expect(chains).toHaveLength(2); // the first invocation is called directly
    const cards = await t.run(async (ctx) => await ctx.db.query("cards").collect());
    expect(cards.every((c) => c.summary !== undefined)).toBe(true);
    expect(cards.find((c) => c.key === first.key)?.summary).toEqual({
      name: "Nami",
      printings: 2,
      image_url: "https://example.test/en/prt_000000000001.png",
    });
    expect(cards.find((c) => c.key === card(2).key)?.summary).toEqual({ name: null, printings: 0, image_url: null });

    const syncId = await t.run(async (ctx) =>
      ctx.db.insert("data_syncs", { data_commit: "a".repeat(40), manifest_sha256: "b".repeat(64), started_at: T, status: "ok" }),
    );
    vi.useFakeTimers();
    try {
      await t.action(internal.cardSummary.chain, { syncId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    const row = await t.run(async (ctx) => ctx.db.get(syncId));
    expect(row).toMatchObject({ summarized_cards: 0 });
    expect(row?.summarized_at).toBeDefined();
  });

  test("a printing added after the last pass shows up on the next", async () => {
    const t = convexTest(schema, modules);
    const c = card(1);
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", c);
      await ctx.db.insert("printings", printing(c.key, "prt_000000000001", "base"));
    });
    await runChain(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("printings", printing(c.key, "prt_000000000002", "parallel"));
    });
    await runChain(t);
    const stored = await t.run(async (ctx) => ctx.db.query("cards").withIndex("by_key", (q) => q.eq("key", c.key)).unique());
    expect(stored?.summary?.printings).toBe(2);
  });
});

describe("browseRow", () => {
  test("reads the stored summary instead of the card's observations and printings", async () => {
    const t = convexTest(schema, modules);
    const c = card(1);
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", { ...c, summary: { name: "Stored", printings: 7, image_url: "https://example.test/stored.png" } });
      // Live rows that disagree: the summary is what the row reads.
      await ctx.db.insert("card_observations", observation(c.key, "Live"));
      await ctx.db.insert("printings", printing(c.key, "prt_000000000001", "base"));
    });
    const page = await t.query(api.cards.browse, { paginationOpts: { numItems: 24, cursor: null } });
    expect(page.page[0]).toMatchObject({ name: "Stored", printings: 7, imageUrl: "https://example.test/stored.png" });
  });

  test("with no summary yet, reads them live", async () => {
    const t = convexTest(schema, modules);
    const c = card(1);
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", c);
      await ctx.db.insert("card_observations", observation(c.key, "Live"));
      await ctx.db.insert("printings", printing(c.key, "prt_000000000001", "base"));
    });
    const page = await t.query(api.cards.browse, { paginationOpts: { numItems: 24, cursor: null } });
    expect(page.page[0]).toMatchObject({ name: "Live", printings: 1, imageUrl: "https://example.test/en/prt_000000000001.png" });
  });
});

describe("the sync and derived fields", () => {
  const stored = { _id: "x", _creationTime: 1, key: "card_1", power: 5000, summary: { name: "Nami", printings: 1, image_url: null } };

  test("a stored summary is not a change", () => {
    expect(sameRecord(stored, { key: "card_1", power: 5000 })).toBe(true);
    expect(sameRecord(stored, { key: "card_1", power: 6000 })).toBe(false);
  });

  test("a replace carries the summary over", () => {
    expect(keepDerived(stored, { key: "card_1", power: 6000 })).toEqual({
      key: "card_1",
      power: 6000,
      summary: { name: "Nami", printings: 1, image_url: null },
    });
    expect(keepDerived({ key: "card_1" }, { key: "card_1", power: 6000 })).toEqual({ key: "card_1", power: 6000 });
  });
});
