// Set codes in their global form, shared by the set index (convex/cardSetsCore)
// and the proxy that moves old set URLs. Pure string rules, no database.

// cn writes a language letter into its codes (OPC-09, STC-31, PRBC-01) and kr
// will (EBK-01). The data repo drops it when it derives product_sets, so cn
// STC-31 is global ST-31; this is the same rule.
export function globalCode(code: string): string {
  return code.replace(/^([A-Z]+?)[CK]-(\d+)$/, "$1-$2");
}

// The set page a product code's old URL now belongs to: its global code, or
// for en's combined boosters (OP14-EB04) the first set the code names. A slug
// that is already a set page, or is not a code (promo), is returned as it is.
export function setSlugFor(slug: string): string {
  const code = globalCode(slug.toUpperCase());
  const combined = /^([A-Z]+)(\d+)-[A-Z]+\d+$/.exec(code);
  return (combined ? `${combined[1]}-${combined[2]}` : code).toLowerCase();
}

// The set a card number is in: OP14-033 is in OP-14, P-001 in P. A printing's
// set is its card number, on every site (the data contract's Sets section).
export function cardSetCode(number: string): string {
  const prefix = number.split("-")[0];
  const m = /^([A-Z]+)(\d+)$/.exec(prefix);
  return m ? `${m[1]}-${m[2]}` : prefix;
}

// A product carrying several sets (en OP14-EB04, cn's two-deck starters) lists
// every set's cards, and a reprint in it cannot say which set it came with. So
// on one set's page it gives only its cards numbered for that set, and the
// cards the set's other products list as well.
export function keepsShared(number: string | undefined, setCode: string | null, listedByOthers: boolean): boolean {
  return listedByOthers || (number !== undefined && setCode !== null && cardSetCode(number) === setCode);
}
