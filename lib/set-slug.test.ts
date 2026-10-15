import { describe, expect, test } from "vitest";
import { cardSetCode, globalCode, keepsShared, setSlugFor } from "./set-slug";
import { movedSetPath } from "../proxy";

describe("globalCode", () => {
  test("drops cn's language letter, and kr's", () => {
    expect(globalCode("OPC-09")).toBe("OP-09");
    expect(globalCode("STC-31")).toBe("ST-31");
    expect(globalCode("EBC-02")).toBe("EB-02");
    expect(globalCode("PRBC-01")).toBe("PRB-01");
    expect(globalCode("EBK-01")).toBe("EB-01");
  });

  test("leaves a global code and a combined one as they are", () => {
    for (const code of ["OP-09", "EB-04", "ST-11", "PRB-02", "DP-01", "OP14-EB04"]) expect(globalCode(code)).toBe(code);
  });
});

describe("setSlugFor", () => {
  test("an old product-code slug names the set page it moved to", () => {
    expect(setSlugFor("opc-09")).toBe("op-09");
    expect(setSlugFor("stc-35")).toBe("st-35");
    expect(setSlugFor("prbc-02")).toBe("prb-02");
    expect(setSlugFor("op14-eb04")).toBe("op-14");
    expect(setSlugFor("op15-eb04")).toBe("op-15");
  });

  test("a set page's own slug, a product with no set, and a bucket stay", () => {
    for (const slug of ["op-09", "eb-04", "st-33", "prb-01", "dp-01", "promo", "limited", "family", "other"]) {
      expect(setSlugFor(slug)).toBe(slug);
    }
  });
});

describe("cardSetCode", () => {
  test("a card number's set", () => {
    expect(cardSetCode("OP14-033")).toBe("OP-14");
    expect(cardSetCode("EB04-001")).toBe("EB-04");
    expect(cardSetCode("ST31-005")).toBe("ST-31");
    expect(cardSetCode("PRB02-010")).toBe("PRB-02");
    expect(cardSetCode("P-001")).toBe("P");
  });

  test("a shared product gives a set its own numbers, and what the set's other products list", () => {
    expect(keepsShared("EB04-001", "EB-04", false)).toBe(true);
    expect(keepsShared("OP14-033", "EB-04", false)).toBe(false);
    // A reprint: kept only when another product of the set lists it too.
    expect(keepsShared("OP09-001", "EB-04", false)).toBe(false);
    expect(keepsShared("OP09-001", "EB-04", true)).toBe(true);
    expect(keepsShared(undefined, "EB-04", false)).toBe(false);
    expect(keepsShared("P-001", null, false)).toBe(false);
  });
});

describe("movedSetPath", () => {
  test("an old set URL moves to its set, language prefix kept", () => {
    expect(movedSetPath("/cards/set/opc-09")).toBe("/cards/set/op-09");
    expect(movedSetPath("/ja/cards/set/op14-eb04")).toBe("/ja/cards/set/op-14");
  });

  test("a current set URL and any other path do not move", () => {
    expect(movedSetPath("/cards/set/op-09")).toBeNull();
    expect(movedSetPath("/zh/cards/set/promo")).toBeNull();
    expect(movedSetPath("/cards/opc-09")).toBeNull();
    expect(movedSetPath("/cards/set/opc-09/extra")).toBeNull();
  });
});
