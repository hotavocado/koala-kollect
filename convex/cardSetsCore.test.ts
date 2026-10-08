import { describe, expect, test } from "vitest";
import { groupProducts, productTitle, type ProductInput } from "./cardSetsCore";

function product(site: ProductInput["site"], code: string | undefined, name: string, kind: ProductInput["kind"]) {
  return { key: `${site}:${code ?? kind}`, site, ...(code ? { code } : {}), name, kind };
}

describe("productTitle", () => {
  test.each([
    ["BOOSTER PACK -Royal Blood- [OP-10]", "Royal Blood"],
    ["EXTRA BOOSTER -EGGHEAD CRISIS- [EB-04]", "EGGHEAD CRISIS"],
    ["PREMIUM BOOSTER -ONE PIECE CARD THE BEST vol.2- [PRB-02]", "ONE PIECE CARD THE BEST vol.2"],
    ["STARTER DECK -Straw Hat Crew- [ST-01]", "Straw Hat Crew"],
    ["STARTER DECK EX -GEAR5- [ST-21]", "GEAR5"],
    ["ULTIMATE DECK -The Three Brothers Bond- [ST-13]", "The Three Brothers Bond"],
    ['STARTER DECK -Yellow Eustass"Captain"Kid- [ST-36]', 'Yellow Eustass"Captain"Kid'],
    ["スタートデッキ 麦わらの一味【ST-01】", "スタートデッキ 麦わらの一味"],
    ["特殊補充包 EGGHEAD CRISIS【EB-04】", "特殊補充包 EGGHEAD CRISIS"],
  ])("%s", (name, title) => {
    expect(productTitle(name)).toBe(title);
  });
});

describe("groupProducts", () => {
  const products = [
    product("en", "OP-13", "BOOSTER PACK -CARRYING ON HIS WILL- [OP-13]", "booster"),
    product("asia-en", "OP-13", "BOOSTER PACK -Carrying on His Will- [OP-13]", "booster"),
    product("jp", "OP-13", "ブースターパック 受け継がれる意志【OP-13】", "booster"),
    product("asia-en", "OP-15", "BOOSTER PACK -Adventure on KAMI’s Island- [OP-15]", "booster"),
    product("en", "OP15-EB04", "BOOSTER PACK -ADVENTURE ON KAMI’S ISLAND- [OP15-EB04]", "booster"),
    product("asia-en", "OP-09", "BOOSTER PACK -Emperors in the New World- [OP-09]", "booster"),
    product("asia-en", "EB-04", "EXTRA BOOSTER -EGGHEAD CRISIS- [EB-04]", "extra"),
    product("asia-en", "ST-09", "STARTER DECK -Side Yamato- [ST-09]", "starter"),
    product("asia-en", "ST-10", "ULTIMATE DECK -The Three Captains- [ST-10]", "starter"),
    product("asia-en", "PRB-01", "PREMIUM BOOSTER -ONE PIECE CARD THE BEST- [PRB-01]", "premium"),
    product("jp", "ST-99", "スタートデッキ テスト【ST-99】", "starter"),
    product("en", undefined, "Promotion card", "promo_bucket"),
    product("jp", undefined, "プロモーションカード", "promo_bucket"),
    product("en", undefined, "Other Product Card", "limited"),
    product("jp", undefined, "限定商品収録カード", "limited"),
    product("jp", undefined, "ファミリーデッキセット", "family"),
  ];
  const groups = groupProducts(products);

  test("orders by kind, then code newest first, with a combined code beside its plain one", () => {
    expect(groups.map((g) => g.slug)).toEqual([
      "op-15",
      "op15-eb04",
      "op-13",
      "op-09",
      "eb-04",
      "prb-01",
      "st-99",
      "st-10",
      "st-09",
      "promo",
      "limited",
      "family",
    ]);
    expect(groups.map((g) => g.order)).toEqual(groups.map((_, i) => i));
  });

  test("one set per code across sites, titled from asia-en first", () => {
    const op13 = groups.find((g) => g.slug === "op-13");
    expect(op13).toMatchObject({ code: "OP-13", kind: "booster", title: "Carrying on His Will" });
    expect(op13?.product_keys).toEqual(["asia-en:OP-13", "en:OP-13", "jp:OP-13"]);
    // en only: its capitals are what there is.
    expect(groups.find((g) => g.slug === "op15-eb04")?.title).toBe("ADVENTURE ON KAMI’S ISLAND");
    // jp only: the code is stripped, the rest kept.
    expect(groups.find((g) => g.slug === "st-99")?.title).toBe("スタートデッキ テスト");
  });

  test("code-less products group across sites by kind", () => {
    const promo = groups.find((g) => g.slug === "promo");
    expect(promo).toMatchObject({ code: null, kind: "promo", title: "Promotion cards" });
    expect(promo?.product_keys).toEqual(["en:promo_bucket", "jp:promo_bucket"]);
    expect(groups.find((g) => g.slug === "limited")?.product_keys).toHaveLength(2);
    expect(groups.find((g) => g.slug === "family")?.title).toBe("Family deck sets");
  });
});

describe("groupProducts by release date", () => {
  const dated = (site: ProductInput["site"], code: string, kind: ProductInput["kind"], release_date?: string) => ({
    ...product(site, code, `[${code}]`, kind),
    ...(release_date ? { release_date } : {}),
  });
  const groups = groupProducts([
    // en and jp disagree; en wins even when jp is later.
    dated("en", "OP-09", "booster", "2024-12-13"),
    dated("jp", "OP-09", "booster", "2024-11-30"),
    // en and jp disagree the other way.
    dated("en", "OP-10", "booster", "2025-03-21"),
    dated("jp", "OP-10", "booster", "2025-03-29"),
    // jp only: its date stands in, marked jp.
    dated("jp", "OP-11", "booster", "2025-05-31"),
    dated("asia-en", "OP-11", "booster", "2025-05-31"),
    // en row without a date: jp's date stands in.
    dated("en", "OP-12", "booster"),
    dated("jp", "OP-12", "booster", "2025-08-22"),
    // No date anywhere: after the dated sets, by code.
    dated("asia-en", "OP-14", "booster"),
    dated("asia-en", "OP-13", "booster"),
    // A partial date reads as undated, on en and on the jp fallback alike.
    dated("en", "OP-08", "booster", "2026"),
    dated("jp", "OP-08", "booster", "2026-12"),
    // A starter dated later than every booster stays in its own kind.
    dated("en", "ST-29", "starter", "2026-01-16"),
    product("en", undefined, "Promotion card", "promo_bucket"),
  ]);

  test("newest date first within a kind, undated after, kinds unchanged", () => {
    expect(groups.map((g) => g.slug)).toEqual(["op-12", "op-11", "op-10", "op-09", "op-14", "op-13", "op-08", "st-29", "promo"]);
  });

  test("the date is en's, or jp's when en has no dated product for the code", () => {
    const by = (slug: string) => groups.find((g) => g.slug === slug);
    expect(by("op-09")).toMatchObject({ release_date: "2024-12-13", release_site: "en" });
    expect(by("op-10")).toMatchObject({ release_date: "2025-03-21", release_site: "en" });
    expect(by("op-11")).toMatchObject({ release_date: "2025-05-31", release_site: "jp" });
    expect(by("op-12")).toMatchObject({ release_date: "2025-08-22", release_site: "jp" });
    expect(by("op-14")).toMatchObject({ release_date: null, release_site: null });
    expect(by("op-08")).toMatchObject({ release_date: null, release_site: null });
    expect(by("promo")).toMatchObject({ release_date: null, release_site: null });
  });
});
