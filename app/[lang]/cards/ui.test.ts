import { describe, expect, test } from "vitest";
import enDict from "@/lib/i18n/en";
import jaDict from "@/lib/i18n/ja";
import {
  cardLabel,
  cnOnly,
  confidenceShown,
  foreignText,
  handoutWhen,
  partialDate,
  printOrigin,
  productLabel,
  quantityNoteShown,
  releaseLabel,
  siteTag,
  textInLine,
} from "./ui";

const EN = { tag: "en-US", t: enDict };

describe("cardLabel", () => {
  const base = { name: null, number: null, donDesign: null };

  test("a printed name wins", () => {
    expect(cardLabel({ ...base, category: "leader", number: "OP01-001", name: "Roronoa Zoro" }, enDict)).toBe("Roronoa Zoro");
  });

  test("two DON designs read differently, by their art", () => {
    const luffy = cardLabel({ ...base, category: "don", donDesign: "OP-01:monkey-d-luffy" }, enDict);
    const nami = cardLabel({ ...base, category: "don", donDesign: "OP-01:nami" }, enDict);
    expect(luffy).toBe("DON!! Monkey D Luffy");
    expect(nami).toBe("DON!! Nami");
  });

  test("a DON with no design and an unnamed numbered card still read as something", () => {
    expect(cardLabel({ ...base, category: "don" }, enDict)).toBe("DON!!");
    expect(cardLabel({ ...base, category: "character", number: "OP01-016" }, enDict)).toBe("OP01-016");
  });
});

describe("releaseLabel", () => {
  const en = { releaseDate: "2022-09-30", releaseSite: "en" as const };
  const jp = { releaseDate: "2022-09-30", releaseSite: "jp" as const };

  test("the index reads the month, the set page the day", () => {
    expect(releaseLabel(en, "month", EN)).toBe("Sep 2022");
    expect(releaseLabel(en, "day", EN)).toBe("Sep 30, 2022");
  });

  test("a Japanese-site date is marked JP at both precisions", () => {
    expect(releaseLabel(jp, "month", EN)).toBe("JP Sep 2022");
    expect(releaseLabel(jp, "day", EN)).toBe("JP Sep 30, 2022");
  });

  test("the first of the month stays in its month in UTC", () => {
    expect(releaseLabel({ releaseDate: "2023-01-01", releaseSite: "en" }, "month", EN)).toBe("Jan 2023");
  });

  test("no date reads as nothing", () => {
    expect(releaseLabel({ releaseDate: null, releaseSite: null }, "month", EN)).toBeNull();
  });
});

describe("handoutWhen", () => {
  test("a date to the year or month stays at that precision", () => {
    expect(partialDate("2025", "en-US")).toBe("2025");
    expect(partialDate("2025-03", "en-US")).toBe("Mar 2025");
    expect(partialDate("2025-03-04", "en-US")).toBe("Mar 4, 2025");
  });

  test("a range reads start to end, and one end alone still reads", () => {
    expect(handoutWhen("2025-01", "2025-03", EN)).toBe("Jan 2025 to Mar 2025");
    expect(handoutWhen("2025-01", "2025-01", EN)).toBe("Jan 2025");
    expect(handoutWhen("2025-01-10", null, EN)).toBe("Jan 10, 2025");
    expect(handoutWhen(null, "2025-03", EN)).toBe("Until Mar 2025");
    expect(handoutWhen(null, null, EN)).toBeNull();
  });

  test("a value outside the contract's formats is shown as written", () => {
    expect(partialDate("spring 2025")).toBe("spring 2025");
    expect(partialDate("2025-02-31", "en-US")).toBe("2025-02-31");
    expect(partialDate("2025-13", "en-US")).toBe("2025-13");
  });
});

describe("quantityNoteShown", () => {
  const pack = "Online Regional Participation Pack Vol.1 x1";

  test("a note that only repeats the quote is not shown", () => {
    expect(quantityNoteShown(pack, pack)).toBeNull();
  });

  test("case and spacing alone do not make a note new", () => {
    expect(quantityNoteShown("online regional participation pack vol.1 x1", ` ${pack}  `)).toBeNull();
    expect(quantityNoteShown("Online Regional  Participation Pack Vol.1 x1", pack)).toBeNull();
  });

  test("a note that says something the quote does not is shown", () => {
    expect(quantityNoteShown("1 per pack", pack)).toBe("1 per pack");
  });

  test("no note, nothing shown", () => {
    expect(quantityNoteShown(null, pack)).toBeNull();
    expect(quantityNoteShown("  ", pack)).toBeNull();
  });
});

describe("cnOnly", () => {
  // P-122 to P-134 (Special Card Set vol.2) are listed by cn and no other site.
  test("a card whose every printing is on cn", () => {
    expect(cnOnly([{ language: "cn" }])).toBe(true);
  });

  test("a card cn shares with any other site", () => {
    expect(cnOnly([{ language: "jp" }, { language: "cn" }])).toBe(false);
    expect(cnOnly([{ language: "en" }])).toBe(false);
  });

  test("a card with no printings yet is not cn-only", () => {
    expect(cnOnly([])).toBe(false);
  });
});

describe("confidenceShown", () => {
  test("a tcgcsv claim names no confidence: the TCGplayer link is its provenance", () => {
    expect(confidenceShown("tcgcsv", "corroborated")).toBeNull();
    expect(confidenceShown("tcgcsv", "authoritative")).toBeNull();
  });

  test("an inferred claim says so whatever its source", () => {
    expect(confidenceShown("tcgcsv", "inferred")).toBe("inferred");
    expect(confidenceShown("official_event", "inferred")).toBe("inferred");
  });

  test("every other source keeps its confidence", () => {
    expect(confidenceShown("namuwiki", "corroborated")).toBe("corroborated");
    expect(confidenceShown("official_cardlist", "authoritative")).toBe("authoritative");
  });
});

describe("card text language", () => {
  test("names carry their site's language tag", () => {
    expect([siteTag("en"), siteTag("jp"), siteTag("cn"), siteTag("tcgcsv"), siteTag(null)]).toEqual([
      "en",
      "ja",
      "zh-Hans",
      "en",
      undefined,
    ]);
  });

  test("the note shows when the text is not in the page's language", () => {
    expect(foreignText("jp", "ja")).toBe(false);
    expect(foreignText("cn", "zh")).toBe(false);
    expect(foreignText("tcgcsv", "en")).toBe(false);
    expect(foreignText("jp", "en")).toBe(true);
    // ko and fr have no card list of their own, so always.
    expect(foreignText("en", "ko")).toBe(true);
    expect(foreignText("en", "fr")).toBe(true);
    expect(foreignText(null, "fr")).toBe(false);
  });

  test("names the text's language in the page's", () => {
    expect(textInLine("jp", enDict)).toBe("Card text in Japanese.");
    expect(textInLine("tcgcsv", jaDict)).toBe("カードテキストは英語です。");
  });
});

describe("productLabel", () => {
  test("code and name, the English name first, the series id when the row never synced", () => {
    expect(productLabel({ productKey: "jp:550117", code: "OP-17", name: "ブースターパック", nameEn: null }, enDict)).toBe("OP-17 ブースターパック");
    expect(productLabel({ productKey: "jp:1", code: "EB-04", name: "エクストラ", nameEn: "Extra" }, enDict)).toBe("EB-04 Extra");
    expect(productLabel({ productKey: "jp:src_ab", code: null, name: "プレイマット", nameEn: null }, enDict)).toBe("プレイマット");
    expect(productLabel({ productKey: "en:569101", code: null, name: null, nameEn: null }, enDict)).toBe("Series 569101");
  });
});

// The print page's origin section: one origin, never both.
describe("printOrigin", () => {
  const product = {
    kind: "product" as const,
    productKey: "jp:src_ab",
    code: null,
    name: "Minted",
    nameEn: null,
    releaseDate: null,
    productUrl: null,
  };
  const listings = [{ productKey: "en:569901" }, { productKey: "jp:src_ab" }];
  const claims = ["claim"];

  test("a product origin shows no claims, and Listed under drops it but keeps the bucket", () => {
    expect(printOrigin({ origin: product, listings, claims })).toEqual({
      product,
      claims: [],
      listedUnder: [{ productKey: "en:569901" }],
    });
  });

  test("Listed under is empty when the origin was its only listing", () => {
    expect(printOrigin({ origin: product, listings: [{ productKey: "jp:src_ab" }], claims }).listedUnder).toEqual([]);
  });

  test("a distribution origin shows the claims and every listing", () => {
    expect(printOrigin({ origin: { kind: "distribution", names: ["Pack"] }, listings, claims })).toEqual({
      product: null,
      claims,
      listedUnder: listings,
    });
  });

  test("no origin still shows claims whose distribution has not synced", () => {
    expect(printOrigin({ origin: null, listings, claims })).toEqual({ product: null, claims, listedUnder: listings });
  });
});
