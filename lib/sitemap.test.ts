import { describe, expect, test } from "vitest";
import { languageAlternates, sitemapEntries, sitePaths } from "./sitemap";

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

describe("sitePaths", () => {
  test("lists home, the set index, each set, each card and each print", () => {
    expect(sitePaths(["op-10", "promo"], [{ key: "card_a", prints: ["prt_1", "prt_2"] }, { key: "card_b", prints: [] }])).toEqual([
      "/",
      "/cards",
      "/cards/set/op-10",
      "/cards/set/promo",
      "/cards/card_a",
      "/cards/card_a/prt_1",
      "/cards/card_a/prt_2",
      "/cards/card_b",
    ]);
  });
});
