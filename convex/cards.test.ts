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

function observation(site: "en" | "jp", name: string, superseded_at?: string) {
  return {
    key: `${zoro.key}:${site}:${name.length.toString(16).padStart(16, "0")}`,
    card_key: zoro.key,
    site,
    lang: site === "en" ? ("en" as const) : ("ja" as const),
    observation_hash: name.length.toString(16).padStart(16, "0"),
    name,
    category: "leader" as const,
    colors: ["red" as const],
    attributes: ["slash" as const],
    types: ["Straw Hat Crew"],
    first_seen_at: T,
    last_seen_at: T,
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
    first_seen_at: T,
    last_seen_at: T,
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
        imageUrl: "https://example.test/jp/prt_000000000002.png",
        printings: 2,
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
