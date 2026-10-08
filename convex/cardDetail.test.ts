/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import fixture from "./fixtures/contract-valid.jsonl?raw";
import schema from "./schema";
import { type RecordType, TYPE_TO_TABLE } from "./syncCore";

// The card page reads the contract's own valid example of every record type,
// inserted as the sync would write it, so a contract change that breaks the
// page goes red here and not on the live site.

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const T = "2026-10-08T00:00:00Z";
const ZORO = "card_0a1b2c3d4e5f";
const DON = "card_d0d0d0d0d0d0";

type Rec = { key: string } & Record<string, unknown>;

function fixtureRecords(): { table: (typeof TYPE_TO_TABLE)[RecordType]; record: Rec }[] {
  return fixture
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; record: Rec })
    .filter(({ type }) => type in TYPE_TO_TABLE) // ingest_run is audit only
    .map(({ type, record }) => ({ table: TYPE_TO_TABLE[type as RecordType], record }));
}

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const { table, record } of fixtureRecords()) {
      // The fixture is the contract's valid example, so each record fits its
      // table; the cast only bridges the JSON parse.
      await ctx.db.insert(table, record as never);
    }
  });
  return t;
}

function printing(key: string, site: "en" | "asia-en" | "jp" | "tc" | "cn", variant: "base" | "parallel" | "alt_art") {
  return {
    key,
    card_key: ZORO,
    site,
    rarity: "L",
    variant,
    image_url: `https://example.test/${site}/${key}.png`,
    source_text: `${site} source ${key}`,
    block_icon: null,
    first_seen_at: T,
  };
}

describe("cards.detail", () => {
  test("an unknown key reads null", async () => {
    const t = await seeded();
    expect(await t.query(api.cards.detail, { key: "card_ffffffffffff" })).toBeNull();
  });

  test("the contract's card reads its facts, text, and one printing's provenance", async () => {
    const t = await seeded();
    const card = await t.query(api.cards.detail, { key: ZORO });
    expect(card).toMatchObject({
      key: ZORO,
      number: "OP01-001",
      category: "leader",
      colors: ["red"],
      life: 5,
      power: 5000,
      cost: null,
      counter: null,
      factsSite: "jp",
      text: {
        site: "en",
        name: "Roronoa Zoro",
        types: ["Supernovas", "Straw Hat Crew"],
        effect: "[DON!! x1] [Your Turn] All of your Characters gain +1000 power.",
        trigger: null,
      },
      // The fixture's base printing, not the parallel: the face is a base.
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
      officialUrl: "https://en.onepiece-cardgame.com/cardlist/?freewords=OP01-001",
    });
    expect(card?.regions.map((r) => [r.site, r.listUrl])).toEqual([
      ["en", "https://en.onepiece-cardgame.com/cardlist/?freewords=OP01-001"],
    ]);
    expect(card?.regions[0].printings.find((p) => p.key === "prt_000000000001")).toEqual({
      key: "prt_000000000001",
      rarity: "L",
      variant: "parallel",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001_p1.png",
      sourceText: "-ROMANCE DAWN- [OP-01]",
      imageIds: ["OP01-001_p1"],
      // The fixture lists the printing under a series page whose
      // product row is not in the fixture, and the listing is closed.
      // Both survive: the page shows what is known, not nothing.
      listings: [
        {
          productKey: "en:569101",
          code: null,
          name: null,
          nameEn: null,
          releaseDate: null,
          removedAt: T,
        },
      ],
      claims: [
        {
          key: "ev_0123456789abcdef",
          source: "official_event",
          sourceUrl: "https://en.onepiece-cardgame.com/events/2025/store_tournament_vol4.php",
          quote: "Participation Pack 2025 Vol.4 (4 types)",
          confidence: "authoritative",
          tier: "participant",
          startsOn: "2025",
          endsOn: null,
          quantityNote: "(4 types)",
          distribution: {
            name: "Store Tournament Vol.4",
            nameNative: null,
            kind: "store_tournament",
            region: "en",
          },
        },
      ],
    });
  });

  test("a DON card reads its gold printing under tcgcsv with an empty provenance string", async () => {
    const t = await seeded();
    const card = await t.query(api.cards.detail, { key: DON });
    expect(card).toMatchObject({
      category: "don",
      number: null,
      donDesign: "OP-01:monkey-d-luffy",
      text: null,
      officialUrl: null,
    });
    expect(card?.regions).toHaveLength(1);
    expect(card?.regions[0]).toMatchObject({
      site: "tcgcsv",
      listUrl: null,
      printings: [{ key: "prt_00000000d0d1", variant: "gold", sourceText: "", imageIds: ["512345"] }],
    });
  });

  test("printings group by site in page order, base first within a site", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      await ctx.db.insert("printings", printing("prt_00000000000a", "jp", "alt_art"));
      await ctx.db.insert("printings", printing("prt_00000000000b", "jp", "base"));
      await ctx.db.insert("printings", printing("prt_00000000000c", "asia-en", "base"));
      await ctx.db.insert("printings", printing("prt_00000000000d", "en", "base"));
    });
    const card = await t.query(api.cards.detail, { key: ZORO });
    expect(card?.regions.map((r) => [r.site, r.printings.map((p) => p.key)])).toEqual([
      // The fixture's own en printings ride along. With no locator, a printing
      // ties on image id and falls back to key; prt_..2 carries the fixture's
      // cn:6987 locator, so it sorts after the unlocated parallel prt_..3.
      ["en", ["prt_000000000004", "prt_00000000000d", "prt_000000000003", "prt_000000000002", "prt_000000000001"]],
      ["asia-en", ["prt_00000000000c"]],
      ["jp", ["prt_00000000000b", "prt_00000000000a"]],
    ]);
    // The face is a base printing, English first, as on the browse grid.
    expect(card?.imageUrl).toBe("https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png");
  });

  test("each site with a searchable list links to it; cn does not", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      await ctx.db.insert("printings", printing("prt_00000000000a", "tc", "base"));
      await ctx.db.insert("printings", printing("prt_00000000000b", "cn", "base"));
      await ctx.db.insert("printings", printing("prt_00000000000c", "jp", "base"));
    });
    const card = await t.query(api.cards.detail, { key: ZORO });
    expect(card?.regions.map((r) => [r.site, r.listUrl])).toEqual([
      ["en", "https://en.onepiece-cardgame.com/cardlist/?freewords=OP01-001"],
      ["jp", "https://www.onepiece-cardgame.com/cardlist/?freewords=OP01-001"],
      ["tc", "https://asia-tc.onepiece-cardgame.com/cardlist/?freewords=OP01-001"],
      ["cn", null],
    ]);
  });

  test("the card's official link skips a top-ranked cn printing for a site with a list", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const { table, record } of fixtureRecords()) {
        // Only the card itself: its contract printing would rank above cn's.
        if (table === "cards") await ctx.db.insert(table, record as never);
      }
      await ctx.db.insert("printings", printing("prt_00000000000a", "cn", "base"));
      await ctx.db.insert("printings", printing("prt_00000000000b", "asia-en", "parallel"));
    });
    const card = await t.query(api.cards.detail, { key: ZORO });
    // The face is cn's base printing, but cn has no list to link to.
    expect(card?.imageUrl).toBe("https://example.test/cn/prt_00000000000a.png");
    expect(card?.officialUrl).toBe("https://asia-en.onepiece-cardgame.com/cardlist/?freewords=OP01-001");
  });

  test("parallels read in image id order, numerically, not by key", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      // Keys sort a, b, c; image ids must put c (_p2) before b (_p3) before a (_p10).
      const ids: [string, string][] = [
        ["prt_0000000000aa", "OP01-001_p10"],
        ["prt_0000000000bb", "OP01-001_p3"],
        ["prt_0000000000cc", "OP01-001_p2"],
      ];
      for (const [key, imageId] of ids) {
        await ctx.db.insert("printings", printing(key, "jp", "parallel"));
        await ctx.db.insert("printing_locators", {
          key: `jp:${imageId}`,
          printing_key: key,
          site: "jp",
          image_id: imageId,
          first_seen_at: T,
        });
      }
    });
    const card = await t.query(api.cards.detail, { key: ZORO });
    const jp = card?.regions.find((r) => r.site === "jp");
    expect(jp?.printings.map((p) => p.imageIds[0])).toEqual(["OP01-001_p2", "OP01-001_p3", "OP01-001_p10"]);
  });

  test("current listings lead and the strongest claim comes first", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      await ctx.db.insert("products", {
        // No release date and a key that sorts after en:569101, so only the
        // current-before-removed rule can put this listing first.
        key: "en:569900",
        site: "en",
        series_id: "569900",
        code: "OP-01",
        name: "ROMANCE DAWN",
        kind: "booster",
        first_seen_at: T,
      });
      await ctx.db.insert("printing_products", {
        key: "prt_000000000001@en:569900",
        printing_key: "prt_000000000001",
        product_key: "en:569900",
        first_seen_at: T,
      });
      // A dated listing with a lower key: it leads the undated one only
      // because dated listings sort before undated ones.
      await ctx.db.insert("products", {
        key: "en:569000",
        site: "en",
        series_id: "569000",
        code: "ST-01",
        name: "Straw Hat Crew",
        kind: "starter",
        release_date: "2022-12-02",
        first_seen_at: T,
      });
      await ctx.db.insert("printing_products", {
        key: "prt_000000000001@en:569000",
        printing_key: "prt_000000000001",
        product_key: "en:569000",
        first_seen_at: T,
      });
      // A weaker claim whose distribution was never synced.
      await ctx.db.insert("printing_distributions", {
        key: "ev_0000000000000000",
        printing_key: "prt_000000000001",
        distribution_key: "dist_ffffffffffff",
        source: "namuwiki",
        source_url: "https://namu.wiki/w/example",
        quote: "event prize",
        confidence: "inferred",
        observed_at: T,
      });
    });
    const card = await t.query(api.cards.detail, { key: ZORO });
    const p = card?.regions[0].printings.find((x) => x.key === "prt_000000000001");
    expect(p?.listings.map((l) => [l.productKey, l.code, l.removedAt])).toEqual([
      ["en:569000", "ST-01", null],
      ["en:569900", "OP-01", null],
      ["en:569101", null, T],
    ]);
    // ev_0000… sorts first by key, so only the confidence rank can put the
    // authoritative claim ahead of it.
    expect(p?.claims.map((c) => [c.key, c.confidence, c.distribution?.name ?? null])).toEqual([
      ["ev_0123456789abcdef", "authoritative", "Store Tournament Vol.4"],
      ["ev_0000000000000000", "inferred", null],
    ]);
  });

  test("two pages on one pack keep their own tier and dates", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      await ctx.db.insert("printing_distributions", {
        key: "ev_fedcba9876543210",
        printing_key: "prt_000000000001",
        distribution_key: "dist_0000000000a1",
        source: "official_topic",
        source_url: "https://en.onepiece-cardgame.com/topics/example.php",
        quote: "Top 4 receive Participation Pack 2025 Vol.4",
        confidence: "inferred",
        observed_at: T,
        tier: "top_cut",
        starts_on: "2025-03",
        ends_on: "2025-05",
      });
    });
    const card = await t.query(api.cards.detail, { key: ZORO });
    const p = card?.regions[0].printings.find((x) => x.key === "prt_000000000001");
    expect(
      p?.claims.map((c) => [c.key, c.distribution?.name, c.tier, c.startsOn, c.endsOn, c.quantityNote]),
    ).toEqual([
      ["ev_0123456789abcdef", "Store Tournament Vol.4", "participant", "2025", null, "(4 types)"],
      ["ev_fedcba9876543210", "Store Tournament Vol.4", "top_cut", "2025-03", "2025-05", null],
    ]);
  });

  test("a superseded observation's text is never shown", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      // The fixture carries two en observations of this card; close both.
      const en = await ctx.db
        .query("card_observations")
        .withIndex("by_card_site", (q) => q.eq("card_key", ZORO).eq("site", "en"))
        .collect();
      expect(en).toHaveLength(2);
      for (const o of en) await ctx.db.patch(o._id, { superseded_at: T });
    });
    const card = await t.query(api.cards.detail, { key: ZORO });
    expect(card?.text).toBeNull();
  });
});
