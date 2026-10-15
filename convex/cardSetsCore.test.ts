import { describe, expect, test } from "vitest";
import { englishTitle, groupProducts, productTitle, type ProductInput } from "./cardSetsCore";

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

describe("englishTitle", () => {
  test.each([
    // All capitals: recased, small words lower after the first.
    ["THE AZURE SEA’S SEVEN", "The Azure Sea’s Seven"],
    ["A FIST OF DIVINE SPEED", "A Fist of Divine Speed"],
    ["CARRYING ON HIS WILL", "Carrying on His Will"],
    ["500 YEARS IN THE FUTURE", "500 Years in the Future"],
    // Brand phrases keep their capitals, and only the brand does.
    ["ADVENTURE ON KAMI’S ISLAND", "Adventure on KAMI’s Island"],
    ["ONE PIECE HEROINES EDITION", "ONE PIECE Heroines Edition"],
    ["ONE PIECE CARD THE BEST", "ONE PIECE CARD THE BEST"],
    // A leading deck colour, on its own.
    ["RED Shanks", "Red Shanks"],
    ["PURPLE/BLACK Monkey.D.Luffy", "Purple/Black Monkey.D.Luffy"],
    // Left as written: mixed case, and words with a digit.
    ["ONE PIECE FILM edition", "ONE PIECE FILM edition"],
    ["ONE PIECE CARD THE BEST vol.2", "ONE PIECE CARD THE BEST vol.2"],
    ["Anime 25th Collection", "Anime 25th Collection"],
    ["GEAR5", "GEAR5"],
    ["3D2Y", "3D2Y"],
    ["Royal Blood", "Royal Blood"],
  ])("%s", (title, expected) => {
    expect(englishTitle(title)).toBe(expected);
  });
});

describe("groupProducts", () => {
  const products = [
    product("en", "OP-13", "BOOSTER PACK -CARRYING ON HIS WILL- [OP-13]", "booster"),
    product("jp", "OP-13", "ブースターパック 受け継がれる意志【OP-13】", "booster"),
    product("en", "OP-15", "BOOSTER PACK -Adventure on KAMI’s Island- [OP-15]", "booster"),
    product("en", "OP15-EB04", "BOOSTER PACK -ADVENTURE ON KAMI’S ISLAND- [OP15-EB04]", "booster"),
    product("en", "OP-09", "BOOSTER PACK -Emperors in the New World- [OP-09]", "booster"),
    product("en", "EB-04", "EXTRA BOOSTER -EGGHEAD CRISIS- [EB-04]", "extra"),
    product("en", "ST-09", "STARTER DECK -Side Yamato- [ST-09]", "starter"),
    product("en", "ST-10", "ULTIMATE DECK -The Three Captains- [ST-10]", "starter"),
    product("en", "PRB-01", "PREMIUM BOOSTER -ONE PIECE CARD THE BEST- [PRB-01]", "premium"),
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

  test("one set per code across sites, titled from en first, recased", () => {
    const op13 = groups.find((g) => g.slug === "op-13");
    expect(op13).toMatchObject({ code: "OP-13", kind: "booster", title: "Carrying on His Will" });
    expect(op13?.product_keys).toEqual(["en:OP-13", "jp:OP-13"]);
    // en only: its capitals recased, the brand kept.
    expect(groups.find((g) => g.slug === "op15-eb04")?.title).toBe("Adventure on KAMI’s Island");
    // jp only: the code is stripped, the rest kept.
    expect(groups.find((g) => g.slug === "st-99")?.title).toBe("スタートデッキ テスト");
  });

  test("with no English site, a product's own name_en is the title, as written", () => {
    const [eb04] = groupProducts([
      { ...product("jp", "EB-04", "エクストラブースター EGGHEAD CRISIS【EB-04】", "extra"), name_en: "EGGHEAD CRISIS" },
      product("cn", "EB-04", "特别补充包 艾格赫德危机【EB-04】", "extra"),
    ]);
    expect(eb04.title).toBe("EGGHEAD CRISIS");
    // An English site's name still goes first.
    const [op13] = groupProducts([
      { ...product("jp", "OP-13", "ブースターパック 受け継がれる意志【OP-13】", "booster"), name_en: "Carried On" },
      product("en", "OP-13", "BOOSTER PACK -CARRYING ON HIS WILL- [OP-13]", "booster"),
    ]);
    expect(op13.title).toBe("Carrying on His Will");
  });

  test("a title in each language, from that site's own product", () => {
    const [op13] = groupProducts([
      product("en", "OP-13", "BOOSTER PACK -CARRYING ON HIS WILL- [OP-13]", "booster"),
      product("jp", "OP-13", "ブースターパック 受け継がれる意志【OP-13】", "booster"),
      product("cn", "OP-13", "补充包 继承的意志【OPC-13】", "booster"),
    ]);
    expect(op13.titles).toEqual({
      en: "Carrying on His Will",
      jp: "ブースターパック 受け継がれる意志",
      cn: "补充包 继承的意志",
    });
    // No en product: name_en is the English title, as it is the title.
    const [eb04] = groupProducts([
      { ...product("jp", "EB-04", "エクストラブースター EGGHEAD CRISIS【EB-04】", "extra"), name_en: "EGGHEAD CRISIS" },
    ]);
    expect(eb04.titles).toEqual({ en: "EGGHEAD CRISIS", jp: "エクストラブースター EGGHEAD CRISIS" });
    // jp only: no English title, and the title is jp's.
    const st99 = groups.find((g) => g.slug === "st-99");
    expect(st99?.titles).toEqual({ jp: "スタートデッキ テスト" });
    // A bucket's English title is ours; jp's is its own.
    expect(groups.find((g) => g.slug === "promo")?.titles).toEqual({ en: "Promotion cards", jp: "プロモーションカード" });
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
    // No en: jp's date stands in, marked jp. cn's later date is ignored,
    // or op-11 would sort ahead of op-12.
    dated("jp", "OP-11", "booster", "2025-05-31"),
    dated("cn", "OP-11", "booster", "2025-09-30"),
    // en row without a date: jp's date stands in.
    dated("en", "OP-12", "booster"),
    dated("jp", "OP-12", "booster", "2025-08-22"),
    // No date anywhere: after the dated sets, by code.
    dated("cn", "OP-14", "booster"),
    dated("cn", "OP-13", "booster"),
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

// Shaped on koala-kollect-data at 653730a: product_sets joins a set across
// languages, and en's combined boosters carry two sets.
describe("groupProducts by product_sets", () => {
  const sets = (p: ProductInput, ...keys: string[]): ProductInput => ({ ...p, sets: keys });
  const products: ProductInput[] = [
    sets({ ...product("en", "OP-14", "BOOSTER PACK -THE AZURE SEA’S SEVEN- [OP-14]", "booster"), release_date: "2026-01-16" }, "OP-14"),
    sets(
      {
        ...product("en", "OP14-EB04", "BOOSTER PACK -THE AZURE SEA’S SEVEN- [OP14-EB04]", "booster"),
        key: "en:569114",
        release_date: "2026-01-16",
      },
      "EB-04",
      "OP-14",
    ),
    sets({ ...product("jp", "OP-14", "ブースターパック 蒼海の七傑【OP-14】", "booster"), release_date: "2025-11-22" }, "OP-14"),
    sets(product("cn", "OPC-14", "补充包 苍海七杰【OPC-14】", "booster"), "OP-14"),
    sets(
      {
        ...product("jp", "EB-04", "エクストラブースター EGGHEAD CRISIS【EB-04】", "extra"),
        key: "jp:550204",
        name_en: "EGGHEAD CRISIS",
        release_date: "2026-01-31",
      },
      "EB-04",
    ),
    sets(product("cn", "EBC-04", "特别补充包 艾格赫德危机【EBC-04】", "extra"), "EB-04"),
    sets(product("en", undefined, "Promotion card", "promo_bucket"), "P"),
    sets(product("jp", undefined, "プロモーションカード", "promo_bucket"), "P"),
    product("en", "DP-01", "Double Pack Set Vol.1 [DP-01]", "other"),
  ];
  const groups = groupProducts(products);
  const bySlug = (slug: string) => groups.find((g) => g.slug === slug);

  test("one page per set across languages; no page per product code", () => {
    expect(groups.map((g) => g.slug).sort()).toEqual(["dp-01", "eb-04", "op-14", "promo"]);
    expect(bySlug("op-14")?.product_keys).toEqual(["cn:OPC-14", "en:569114", "en:OP-14", "jp:OP-14"]);
    expect(bySlug("eb-04")?.product_keys).toEqual(["cn:EBC-04", "en:569114", "jp:550204"]);
  });

  test("EB-04 is titled, kinded and dated by jp:550204, never by the en booster that holds it", () => {
    expect(bySlug("eb-04")).toMatchObject({
      code: "EB-04",
      kind: "extra",
      title: "EGGHEAD CRISIS",
      titles: { en: "EGGHEAD CRISIS", jp: "エクストラブースター EGGHEAD CRISIS", cn: "特别补充包 艾格赫德危机" },
      release_date: "2026-01-31",
      release_site: "jp",
    });
  });

  test("cn's product titles its own language on the global set", () => {
    expect(bySlug("op-14")).toMatchObject({
      code: "OP-14",
      kind: "booster",
      title: "The Azure Sea’s Seven",
      titles: { en: "The Azure Sea’s Seven", jp: "ブースターパック 蒼海の七傑", cn: "补充包 苍海七杰" },
      release_date: "2026-01-16",
      release_site: "en",
    });
  });

  test("a product carrying two sets is shared, and its old slug is the first set's alias", () => {
    expect(bySlug("op-14")?.shared).toEqual([{ product_key: "en:569114", other_sets: ["EB-04"] }]);
    expect(bySlug("eb-04")?.shared).toEqual([{ product_key: "en:569114", other_sets: ["OP-14"] }]);
    expect(bySlug("op-14")?.aliases).toEqual(["op14-eb04", "opc-14"]);
    expect(bySlug("eb-04")?.aliases).toEqual(["ebc-04"]);
  });

  test("set P stays the promo bucket, and a product with no set keeps its code's page", () => {
    expect(bySlug("promo")).toMatchObject({ code: null, kind: "promo", title: "Promotion cards", aliases: [], shared: [] });
    expect(bySlug("promo")?.product_keys).toEqual(["en:promo_bucket", "jp:promo_bucket"]);
    expect(bySlug("dp-01")).toMatchObject({ code: "DP-01", kind: "other", aliases: [], shared: [] });
  });
});
