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
