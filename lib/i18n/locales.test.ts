import { describe, expect, test } from "vitest";
import { fill, plural } from "./format";
import { localePath, negotiate, splitLocale } from "./locales";

describe("negotiate", () => {
  test("picks the highest-weighted supported language", () => {
    expect(negotiate("de-DE,de;q=0.9,ja;q=0.8,en;q=0.7")).toBe("ja");
    expect(negotiate("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
  });

  test("reads every Chinese tag as the Simplified Chinese site", () => {
    expect(negotiate("zh-TW")).toBe("zh");
    expect(negotiate("zh-Hant-HK,zh;q=0.5")).toBe("zh");
  });

  test("ignores q=0 and unsupported languages", () => {
    expect(negotiate("ja;q=0,de")).toBeNull();
    expect(negotiate("ko;q=0.2,ja;q=0.5")).toBe("ja");
  });

  test("returns null with no header", () => {
    expect(negotiate(null)).toBeNull();
    expect(negotiate("")).toBeNull();
  });
});

describe("splitLocale and localePath", () => {
  test("split the locale prefix off a pathname", () => {
    expect(splitLocale("/ja/cards/x")).toEqual({ lang: "ja", path: "/cards/x" });
    expect(splitLocale("/ko")).toEqual({ lang: "ko", path: "/" });
    expect(splitLocale("/cards")).toEqual({ lang: null, path: "/cards" });
    // A path that only starts with a locale's letters is not prefixed.
    expect(splitLocale("/japan")).toEqual({ lang: null, path: "/japan" });
  });

  test("English is bare, every other language is prefixed", () => {
    expect(localePath("en", "/cards")).toBe("/cards");
    expect(localePath("en", "/")).toBe("/");
    expect(localePath("zh", "/cards/set/op-01")).toBe("/zh/cards/set/op-01");
    expect(localePath("fr", "/")).toBe("/fr");
  });
});

describe("plural and fill", () => {
  const printings = { one: "{n} printing", other: "{n} printings" };

  test("picks the language's plural form", () => {
    expect(plural("en", printings, 1)).toBe("1 printing");
    expect(plural("en", printings, 0)).toBe("0 printings");
    // French counts 0 as singular.
    expect(plural("fr", { one: "{n} impression", other: "{n} impressions" }, 0)).toBe("0 impression");
    expect(plural("ja", { other: "{n}プリント" }, 3)).toBe("3プリント");
  });

  test("formats the number for the language", () => {
    expect(plural("en", printings, 1234)).toBe("1,234 printings");
  });

  test("leaves a slot with no value as written", () => {
    expect(fill("From {origins}", {})).toBe("From {origins}");
    expect(fill("{a} and {b}", { a: 1, b: "two" })).toBe("1 and two");
  });
});
