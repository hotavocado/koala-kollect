import { describe, expect, test } from "vitest";
import { cardLabel, releaseLabel } from "./ui";

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

describe("releaseLabel", () => {
  const en = { releaseDate: "2022-09-30", releaseSite: "en" as const };
  const jp = { releaseDate: "2022-09-30", releaseSite: "jp" as const };

  test("the index reads the month, the set page the day", () => {
    expect(releaseLabel(en, "month", "en-US")).toBe("Sep 2022");
    expect(releaseLabel(en, "day", "en-US")).toBe("Sep 30, 2022");
  });

  test("a Japanese-site date is marked JP at both precisions", () => {
    expect(releaseLabel(jp, "month", "en-US")).toBe("JP Sep 2022");
    expect(releaseLabel(jp, "day", "en-US")).toBe("JP Sep 30, 2022");
  });

  test("the first of the month stays in its month in UTC", () => {
    expect(releaseLabel({ releaseDate: "2023-01-01", releaseSite: "en" }, "month", "en-US")).toBe("Jan 2023");
  });

  test("no date reads as nothing", () => {
    expect(releaseLabel({ releaseDate: null, releaseSite: null }, "month")).toBeNull();
  });
});
