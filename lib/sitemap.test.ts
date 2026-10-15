import { describe, expect, test } from "vitest";
import {
  SHARD_URL_WARN,
  SITEMAP_BUCKETS,
  bucketOf,
  languageAlternates,
  parseSitemapId,
  shardWarning,
  sitemapEntries,
  sitemapIds,
  sitePaths,
} from "./sitemap";

const ORIGIN = "https://koalakollect.app";

describe("languageAlternates", () => {
  test("carries all five locale tags and x-default", () => {
    expect(Object.keys(languageAlternates("/cards").languages).sort()).toEqual(
      ["en", "fr", "ja", "ko", "x-default", "zh-Hans"].sort(),
    );
  });

  test("every URL is absolute on the site origin", () => {
    for (const url of Object.values(languageAlternates("/cards/card_x").languages)) {
      expect(url.startsWith(`${ORIGIN}/`)).toBe(true);
    }
  });

  test("English is bare and the other locales are prefixed", () => {
    expect(languageAlternates("/cards/card_x").languages).toEqual({
      en: `${ORIGIN}/cards/card_x`,
      ja: `${ORIGIN}/ja/cards/card_x`,
      "zh-Hans": `${ORIGIN}/zh/cards/card_x`,
      ko: `${ORIGIN}/ko/cards/card_x`,
      fr: `${ORIGIN}/fr/cards/card_x`,
      "x-default": `${ORIGIN}/cards/card_x`,
    });
  });

  test("x-default is the bare English URL", () => {
    const { languages } = languageAlternates("/cards/set/op-10");
    expect(languages["x-default"]).toBe(`${ORIGIN}/cards/set/op-10`);
    expect(languages["x-default"]).toBe(languages.en);
  });

  test("the root is the bare origin in English and /ja, not /ja/, in Japanese", () => {
    const { languages } = languageAlternates("/");
    expect(languages.en).toBe(`${ORIGIN}/`);
    expect(languages.ja).toBe(`${ORIGIN}/ja`);
    expect(languages["x-default"]).toBe(`${ORIGIN}/`);
  });
});

describe("sitemapEntries", () => {
  test("a Japanese shard's URLs are /ja-prefixed and carry the path's alternates", () => {
    expect(sitemapEntries("ja", ["/", "/cards"])).toEqual([
      { url: `${ORIGIN}/ja`, alternates: languageAlternates("/") },
      { url: `${ORIGIN}/ja/cards`, alternates: languageAlternates("/cards") },
    ]);
  });

  test("the English shard's URLs are bare", () => {
    expect(sitemapEntries("en", ["/", "/cards/card_x"]).map((e) => e.url)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/cards/card_x`,
    ]);
  });
});

// Card keys as the data repo mints them: card_ and twelve base-36 characters.
// A seeded generator, so the set is the same on every run.
function cardKeys(n: number): string[] {
  let seed = 0x2f6b1d;
  const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0);
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  return Array.from({ length: n }, () => "card_" + Array.from({ length: 12 }, () => chars[(next() >>> 16) % 36]).join(""));
}

describe("bucketOf", () => {
  test("is deterministic", () => {
    expect(bucketOf("card_000es51b0sq0")).toBe(bucketOf("card_000es51b0sq0"));
    expect(cardKeys(50).map(bucketOf)).toEqual(cardKeys(50).map(bucketOf));
  });

  test("puts every key in a bucket from 0 to 7", () => {
    for (const key of [...cardKeys(3000), "", "card_", "x".repeat(200)]) {
      const b = bucketOf(key);
      expect(Number.isInteger(b) && b >= 0 && b < SITEMAP_BUCKETS).toBe(true);
    }
  });

  test("spreads 3,000 realistic keys within 15% of an even share", () => {
    const counts = new Array<number>(SITEMAP_BUCKETS).fill(0);
    for (const key of cardKeys(3000)) counts[bucketOf(key)]++;
    const even = 3000 / SITEMAP_BUCKETS;
    for (const c of counts) expect(Math.abs(c - even) / even).toBeLessThan(0.15);
  });

  test("spreads near-identical keys too", () => {
    const counts = new Array<number>(SITEMAP_BUCKETS).fill(0);
    for (let i = 0; i < 800; i++) counts[bucketOf(`card_${String(i).padStart(12, "0")}`)]++;
    for (const c of counts) expect(c).toBeGreaterThan(60);
  });
  test("spreads keys that differ only in their characters' high bits", () => {
    // 0, 8, h, p and x share their low three bits, which is all a bare FNV-1a
    // modulo 8 would see.
    const alphabet = "08hpx";
    const counts = new Array<number>(SITEMAP_BUCKETS).fill(0);
    for (let i = 0; i < 625; i++) {
      const tail = Array.from({ length: 4 }, (_, d) => alphabet[Math.floor(i / 5 ** d) % 5]).join("");
      counts[bucketOf(`card_00000000${tail}`)]++;
    }
    for (const c of counts) expect(c).toBeGreaterThan(40);
  });
});

describe("sitemap ids", () => {
  test("eight per language, lang-bucket", () => {
    const ids = sitemapIds();
    expect(ids).toHaveLength(40);
    expect(ids.slice(0, 8)).toEqual(["en-0", "en-1", "en-2", "en-3", "en-4", "en-5", "en-6", "en-7"]);
    expect(ids).toContain("zh-7");
    for (const id of ids) expect(parseSitemapId(id)).not.toBeNull();
  });

  test("parse a shard id and refuse anything else", () => {
    expect(parseSitemapId("ja-3")).toEqual({ lang: "ja", bucket: 3 });
    for (const bad of ["ja", "de-0", "ja-8", "ja-03", "ja--1", "en-0.5", "en-0x"]) expect(parseSitemapId(bad)).toBeNull();
  });
});

describe("sitePaths", () => {
  const keys = cardKeys(200);
  const cards = keys.map((key, i) => ({ key, prints: i % 2 ? [`prt_${i}a`, `prt_${i}b`] : [] }));

  test("bucket 0 holds home, the set index and each set; no other bucket does", () => {
    expect(sitePaths(0, ["op-10", "promo"], []).slice(0, 4)).toEqual(["/", "/cards", "/cards/set/op-10", "/cards/set/promo"]);
    for (let b = 1; b < SITEMAP_BUCKETS; b++) expect(sitePaths(b, ["op-10"], [])).toEqual([]);
  });

  test("a card and its prints share its bucket", () => {
    // A card outside bucket 0, which also holds the static pages.
    const card = cards.find((c, i) => i % 2 === 1 && bucketOf(c.key) !== 0)!;
    const i = cards.indexOf(card);
    const b = bucketOf(card.key);
    expect(sitePaths(b, [], [card])).toEqual([`/cards/${card.key}`, `/cards/${card.key}/prt_${i}a`, `/cards/${card.key}/prt_${i}b`]);
    // Another bucket that is not 0 either: it lists nothing of this card.
    expect(sitePaths(b === SITEMAP_BUCKETS - 1 ? 1 : b + 1, [], [card])).toEqual([]);
  });

  test("the buckets together list every page exactly once", () => {
    const all = Array.from({ length: SITEMAP_BUCKETS }, (_, b) => sitePaths(b, ["op-10"], cards)).flat();
    expect(all).toHaveLength(2 + 1 + cards.length + 200);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("shardWarning", () => {
  test("is quiet up to 4,000 URLs", () => {
    expect(SHARD_URL_WARN).toBe(4000);
    expect(shardWarning("en-0", 0)).toBeNull();
    expect(shardWarning("en-0", 4000)).toBeNull();
  });

  test("past 4,000 names the shard and says to raise the bucket count", () => {
    const w = shardWarning("ja-3", 4001);
    expect(w).toContain("/sitemap/ja-3.xml");
    expect(w).toContain("4001");
    expect(w).toContain("raise the bucket count");
  });
});
