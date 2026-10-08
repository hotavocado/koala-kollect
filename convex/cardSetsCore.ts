import type { Doc } from "./_generated/dataModel";

// Pure grouping for the set index: products from every site become one set
// per product code, and the code-less per-site buckets (promotion cards,
// limited product cards, family deck sets) become one set per kind. No
// database access here, so the rules are unit-tested directly.

export type SetKind = "booster" | "extra" | "premium" | "starter" | "promo" | "limited" | "family" | "other";

// Index order. No product carries a release date yet, so kind then code
// (newest first) stands in for "by set, then by time".
export const SET_KIND_ORDER: readonly SetKind[] = [
  "booster",
  "extra",
  "premium",
  "starter",
  "promo",
  "limited",
  "family",
  "other",
];

export type ProductInput = Pick<Doc<"products">, "key" | "site" | "code" | "name" | "kind">;

export type SetGroup = {
  slug: string;
  code: string | null;
  kind: SetKind;
  title: string;
  product_keys: string[];
  order: number;
};

const KIND_OF: Record<Doc<"products">["kind"], SetKind> = {
  booster: "booster",
  extra: "extra",
  premium: "premium",
  starter: "starter",
  promo_bucket: "promo",
  limited: "limited",
  family: "family",
  other: "other",
};

const BUCKET_TITLE: Record<SetKind, string> = {
  booster: "Booster packs",
  extra: "Extra boosters",
  premium: "Premium boosters",
  starter: "Starter decks",
  promo: "Promotion cards",
  limited: "Limited product cards",
  family: "Family deck sets",
  other: "Other cards",
};

// Whose product name becomes the title: asia-en writes titles in title case,
// en often in capitals, and jp and tc only in their own languages.
const TITLE_SITE_ORDER: Doc<"products">["site"][] = ["asia-en", "en", "jp", "tc", "cn"];

// "BOOSTER PACK -Royal Blood- [OP-10]" -> "Royal Blood" (en, asia-en).
// "スタートデッキ 麦わらの一味【ST-01】" -> "スタートデッキ 麦わらの一味" (jp, tc).
export function productTitle(name: string): string {
  const dashed = /^.*? -(.+)- \[[^\]]+\]$/.exec(name);
  if (dashed) return dashed[1].trim();
  return name.replace(/\s*(\[[^\]]*\]|【[^】]*】)\s*$/, "").trim();
}

// "OP-15" and "OP15-EB04" both sort as OP 15; the plain code leads.
function codeRank(code: string): { series: string; number: number } {
  const m = /^([A-Z]+)-?(\d+)/.exec(code);
  return m ? { series: m[1], number: Number(m[2]) } : { series: code, number: -1 };
}

function compareSets(a: Omit<SetGroup, "order">, b: Omit<SetGroup, "order">): number {
  const byKind = SET_KIND_ORDER.indexOf(a.kind) - SET_KIND_ORDER.indexOf(b.kind);
  if (byKind !== 0) return byKind;
  if (a.code === null || b.code === null) return (a.code === null ? 1 : 0) - (b.code === null ? 1 : 0);
  const ra = codeRank(a.code);
  const rb = codeRank(b.code);
  return (
    ra.series.localeCompare(rb.series) ||
    rb.number - ra.number ||
    a.code.length - b.code.length ||
    a.code.localeCompare(b.code)
  );
}

export function groupProducts(products: ProductInput[]): SetGroup[] {
  const bySlug = new Map<string, { code: string | null; kind: SetKind; products: ProductInput[] }>();
  for (const p of products) {
    const kind = KIND_OF[p.kind];
    const slug = p.code ? p.code.toLowerCase() : kind;
    const group = bySlug.get(slug);
    if (group) group.products.push(p);
    else bySlug.set(slug, { code: p.code ?? null, kind, products: [p] });
  }

  const groups = [...bySlug].map(([slug, g]) => {
    let title = BUCKET_TITLE[g.kind];
    if (g.code !== null) {
      const named = TITLE_SITE_ORDER.map((s) => g.products.find((p) => p.site === s)).find(Boolean);
      title = (named && productTitle(named.name)) || g.code;
    }
    return {
      slug,
      code: g.code,
      kind: g.kind,
      title,
      product_keys: g.products.map((p) => p.key).sort(),
    };
  });
  return groups.sort(compareSets).map((g, order) => ({ ...g, order }));
}
