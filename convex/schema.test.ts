import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";

// The printings table mirrors the contract's variant rule: normal, foil and
// stamped are TCGplayer's (tcgcsv) and refused on every official site, where
// the data repo refuses them too (koala-kollect-data #15). gold stays allowed
// everywhere.

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const OFFICIAL = ["en", "asia-en", "jp", "tc", "cn"] as const;
const TCGCSV_ONLY = ["normal", "foil", "stamped"] as const;

function printing(site: string, variant: string) {
  return {
    key: "prt_000000000001",
    card_key: "card_0a1b2c3d4e5f",
    site,
    rarity: "L",
    variant,
    image_url: "https://example.test/a.png",
    source_text: "source",
    block_icon: null,
    first_seen_at: "2026-10-09T00:00:00Z",
  };
}

async function insert(site: string, variant: string) {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("printings", printing(site, variant) as never);
  });
}

describe("printings.variant", () => {
  test.each(OFFICIAL.flatMap((site) => TCGCSV_ONLY.map((variant) => [site, variant] as const)))(
    "refuses %s with %s",
    async (site, variant) => {
      // The row differs from an accepted one (below) only in variant, so the
      // union refusal is the variant's.
      await expect(insert(site, variant)).rejects.toThrow(/Validator error: Expected one of object, object/);
    },
  );

  test.each(TCGCSV_ONLY)("accepts tcgcsv with %s", async (variant) => {
    await expect(insert("tcgcsv", variant)).resolves.toBeUndefined();
  });

  test.each(OFFICIAL)("accepts %s with base and gold", async (site) => {
    await expect(insert(site, "base")).resolves.toBeUndefined();
    await expect(insert(site, "gold")).resolves.toBeUndefined();
  });
});
