import { describe, expect, test } from "vitest";
import { parseCardNumber } from "./cardSearchCore";

describe("parseCardNumber", () => {
  test.each([
    // Whole numbers, with and without the hyphen, any case.
    ["OP01-001", { exact: ["OP01-001"], prefix: "OP01-001" }],
    ["op01-001", { exact: ["OP01-001"], prefix: "OP01-001" }],
    ["op01001", { exact: ["OP01-001"], prefix: "OP01-001" }],
    [" OP01 - 001 ", { exact: ["OP01-001"], prefix: "OP01-001" }],
    ["ST01-001", { exact: ["ST01-001"], prefix: "ST01-001" }],
    ["EB03-001", { exact: ["EB03-001"], prefix: "EB03-001" }],
    ["PRB01-001", { exact: ["PRB01-001"], prefix: "PRB01-001" }],
    // Short digits are padded for the exact try; the prefix stays as typed.
    ["op1-1", { exact: ["OP01-001"], prefix: "OP1-1" }],
    ["ST1-12", { exact: ["ST01-012"], prefix: "ST1-12" }],
    // Promos have no set digits.
    ["P-034", { exact: ["P-034"], prefix: "P-034" }],
    ["p034", { exact: ["P-034"], prefix: "P-034" }],
    ["p34", { exact: ["P-034"], prefix: "P-34" }],
    ["P-", { exact: [], prefix: "P-" }],
    // Partial numbers list by prefix.
    ["OP01", { exact: [], prefix: "OP01" }],
    ["op01-", { exact: [], prefix: "OP01-" }],
    ["ST01-0", { exact: ["ST01-000"], prefix: "ST01-0" }],
  ])("%s", (raw, want) => {
    expect(parseCardNumber(raw)).toEqual(want);
  });

  test.each([
    // Names, including ones that start like a number's letters.
    "Perona",
    "P",
    "OP",
    "Stussy",
    "Ebisu",
    "Nami",
    "ルフィ",
    "",
    // Too many digits for any real number.
    "OP001-001",
    "OP01-0001",
    "P-0345",
    "OP010",
  ])("%s is not a number", (raw) => {
    expect(parseCardNumber(raw)).toBeNull();
  });
});
