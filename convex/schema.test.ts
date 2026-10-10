/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import fixture from "./fixtures/contract-valid.jsonl?raw";
import schema from "./schema";

// The printings table mirrors the contract's variant rule: normal, foil and
// stamped are TCGplayer's (tcgcsv) and refused on every official site, where
// the data repo refuses them too (koala-kollect-data #15). gold stays allowed
// everywhere.

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const OFFICIAL = ["en", "jp", "cn"] as const;
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

// A Release Event group is a distribution minted from tcgcsv; tcgcsv is still
// never a product site.
describe("distributions.site and products.site", () => {
  const distribution = (site: string) => ({
    key: "dist_000000000001",
    site,
    region: "en",
    kind: "event_pack",
    name: "Release Event Cards: OP17",
  });

  test("a distribution accepts tcgcsv", async () => {
    const t = convexTest(schema, modules);
    await expect(t.run((ctx) => ctx.db.insert("distributions", distribution("tcgcsv") as never))).resolves.toEqual(expect.any(String));
  });

  test("a distribution refuses a site that is neither official nor tcgcsv", async () => {
    const t = convexTest(schema, modules);
    await expect(t.run((ctx) => ctx.db.insert("distributions", distribution("tcgplayer") as never))).rejects.toThrow(/Validator error/);
  });

  // The contract's own product row, moved to tcgcsv, is refused; on its own
  // site it is accepted, so the refusal is the site's.
  const product = fixture
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; record: Record<string, unknown> })
    .find((r) => r.type === "product")!.record;

  test.each([
    ["accepts", product.site],
    ["refuses", "tcgcsv"],
  ])("a product %s site %s", async (verdict, site) => {
    const t = convexTest(schema, modules);
    const insert = t.run((ctx) => ctx.db.insert("products", { ...product, site } as never));
    await (verdict === "accepts" ? expect(insert).resolves.toEqual(expect.any(String)) : expect(insert).rejects.toThrow(/Validator error/));
  });
});
