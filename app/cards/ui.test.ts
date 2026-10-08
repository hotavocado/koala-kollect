import { describe, expect, test } from "vitest";
import { cardLabel } from "./ui";

describe("cardLabel", () => {
  const base = { name: null, number: null, donDesign: null };

  test("a printed name wins", () => {
    expect(cardLabel({ ...base, category: "leader", number: "OP01-001", name: "Roronoa Zoro" })).toBe("Roronoa Zoro");
  });

  test("two DON designs read differently, by their art", () => {
    const luffy = cardLabel({ ...base, category: "don", donDesign: "OP-01:monkey-d-luffy" });
    const nami = cardLabel({ ...base, category: "don", donDesign: "OP-01:nami" });
    expect(luffy).toBe("DON!! Monkey D Luffy");
    expect(nami).toBe("DON!! Nami");
  });

  test("a DON with no design and an unnamed numbered card still read as something", () => {
    expect(cardLabel({ ...base, category: "don" })).toBe("DON!!");
    expect(cardLabel({ ...base, category: "character", number: "OP01-016" })).toBe("OP01-016");
  });
});
