import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// Designs on the card page and the browse tile. A design is one art of a card
// in any language (schema.ts designs); a printing joins one through
// printing_designs, and a printing with no row is unreviewed.

type Site = Doc<"printings">["site"];

// The card page groups printings by language, not by site. tcgcsv is a
// TCGplayer catalogue, not a language, and its only One Piece category is
// English, so its DON printings and the stamped Release Event prints no
// official list carries sit under English, after the official en printings.
export type Language = Exclude<Site, "tcgcsv">;
export const LANGUAGE_OF: Record<Site, Language> = {
  en: "en",
  jp: "jp",
  cn: "cn",
  tcgcsv: "en",
};
// Language order on the page: English first, as on the browse page.
export const LANGUAGE_ORDER: Language[] = ["en", "jp", "cn"];

// Each printing's design, by printing key. A row naming a design that is not
// this card's (or has not synced) leaves the printing unreviewed, so the page
// never shows a design the card does not have.
export async function readDesigns(
  db: QueryCtx["db"],
  cardKey: string,
  printings: Doc<"printings">[],
): Promise<Map<string, Doc<"designs">>> {
  const [designs, rows] = await Promise.all([
    db
      .query("designs")
      .withIndex("by_card", (q) => q.eq("card_key", cardKey))
      .collect(),
    Promise.all(
      printings.map((p) =>
        db
          .query("printing_designs")
          .withIndex("by_printing", (q) => q.eq("printing_key", p.key))
          .first(),
      ),
    ),
  ]);
  const byKey = new Map(designs.map((d) => [d.key, d]));
  const designOf = new Map<string, Doc<"designs">>();
  rows.forEach((row, i) => {
    const design = row && byKey.get(row.design_key);
    if (design) designOf.set(printings[i].key, design);
  });
  return designOf;
}

export type DesignCounts = { designs: number; languages: number; unreviewed: number };

// What the tile and the page headline count: designs with a printing, the
// languages the card is printed in (tcgcsv is English), and printings no
// design holds yet.
export function designCounts(
  printings: Pick<Doc<"printings">, "key" | "site">[],
  designOf: ReadonlyMap<string, Pick<Doc<"designs">, "key">>,
): DesignCounts {
  const designs = new Set<string>();
  let unreviewed = 0;
  for (const p of printings) {
    const d = designOf.get(p.key);
    if (d) designs.add(d.key);
    else unreviewed++;
  }
  return {
    designs: designs.size,
    languages: new Set(printings.map((p) => LANGUAGE_OF[p.site])).size,
    unreviewed,
  };
}

// The language a design is exclusive to, or null. Derived: all its printings
// are in one language, the card is printed in another, and no unreviewed
// printing sits in a language the design lacks (until those are reviewed the
// answer is unknown, so no star). A design's exclusive_override wins either
// way; a true override still needs the design to be in one language, since
// the label names it.
export function exclusiveLanguage(
  override: boolean | null | undefined,
  designLanguages: ReadonlySet<Language>,
  cardLanguages: ReadonlySet<Language>,
  unreviewedLanguages: ReadonlySet<Language>,
): Language | null {
  if (designLanguages.size !== 1) return null;
  const [only] = designLanguages;
  if (override === true) return only;
  if (override === false) return null;
  const elsewhere = [...cardLanguages].some((l) => l !== only);
  const pending = [...unreviewedLanguages].some((l) => l !== only);
  return elsewhere && !pending ? only : null;
}
