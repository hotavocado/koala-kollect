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

function printing(key: string, site: "en" | "asia-en" | "jp", variant: "base" | "parallel" | "alt_art") {
  return {
    key,
    card_key: ZORO,
    site,
    rarity: "L",
    variant,
    image_url: `https://example.test/${site}/${key}.png`,
    source_text: `${site} source ${key}`,
    first_seen_at: T,
    last_seen_at: T,
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
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001_p1.png",
    });
    expect(card?.regions).toEqual([
      {
        site: "en",
        printings: [
          {
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
                distribution: {
                  name: "Store Tournament Vol.4",
                  nameNative: null,
                  kind: "store_tournament",
                  region: "en",
                  tier: "participant",
                  startsOn: "2025",
                  endsOn: null,
                },
              },
            ],
          },
        ],
      },
    ]);
  });

  test("a DON card reads its gold printing under tcgcsv with an empty provenance string", async () => {
    const t = await seeded();
    const card = await t.query(api.cards.detail, { key: DON });
    expect(card).toMatchObject({ category: "don", number: null, text: null });
    expect(card?.regions).toHaveLength(1);
    expect(card?.regions[0]).toMatchObject({
      site: "tcgcsv",
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
      ["en", ["prt_00000000000d", "prt_000000000001"]],
      ["asia-en", ["prt_00000000000c"]],
      ["jp", ["prt_00000000000b", "prt_00000000000a"]],
    ]);
    // The face is a base printing, English first, as on the browse grid.
    expect(card?.imageUrl).toBe("https://example.test/en/prt_00000000000d.png");
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
        last_seen_at: T,
      });
      await ctx.db.insert("printing_products", {
        key: "prt_000000000001@en:569900",
        printing_key: "prt_000000000001",
        product_key: "en:569900",
        first_seen_at: T,
        last_seen_at: T,
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
        last_seen_at: T,
      });
      await ctx.db.insert("printing_products", {
        key: "prt_000000000001@en:569000",
        printing_key: "prt_000000000001",
        product_key: "en:569000",
        first_seen_at: T,
        last_seen_at: T,
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

  test("a superseded observation's text is never shown", async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      const en = await ctx.db
        .query("card_observations")
        .withIndex("by_card_site", (q) => q.eq("card_key", ZORO).eq("site", "en"))
        .unique();
      await ctx.db.patch(en!._id, { superseded_at: T });
    });
    const card = await t.query(api.cards.detail, { key: ZORO });
    expect(card?.text).toBeNull();
  });
});
