import type { Doc } from "./_generated/dataModel";

// Pure grouping for the set index: products from every site become one set
// per product code, and the code-less per-site buckets (promotion cards,
// limited product cards, family deck sets) become one set per kind. No
// database access here, so the rules are unit-tested directly.

export type SetKind = "booster" | "extra" | "premium" | "starter" | "promo" | "limited" | "family" | "other";

// Index order: kind, then release date newest first within a kind. A set's
// date is its en product's release date, or its jp product's when en has no
// dated row for the code (the index labels which). Undated sets follow the dated
// ones in each kind, newest code first.
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

export type ProductInput = Pick<Doc<"products">, "key" | "site" | "code" | "name" | "name_en" | "kind" | "release_date">;

export type ReleaseSite = "en" | "jp";

export type SetGroup = {
  slug: string;
  code: string | null;
  kind: SetKind;
  title: string;
  product_keys: string[];
  release_date: string | null;
  release_site: ReleaseSite | null;
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

// Whose product name becomes the title: en writes titles, often in capitals
// (englishTitle evens those out), and jp and cn only in their own languages,
// so a product's own name_en goes ahead of theirs.
const ENGLISH_SITES: Doc<"products">["site"][] = ["en"];
const OTHER_SITES: Doc<"products">["site"][] = ["jp", "cn"];

// Written as the products print them, so englishTitle leaves them alone.
const BRAND_PHRASES = ["ONE PIECE CARD THE BEST", "ONE PIECE", "KAMI"];
const SMALL_WORDS = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to"]);
const COLOR_WORDS = new Set(["RED", "GREEN", "BLUE", "PURPLE", "BLACK", "YELLOW"]);

// en writes most set names in capitals: "THE AZURE SEA’S SEVEN" reads as
// "The Azure Sea’s Seven", the official title case. Only a title that is all
// capitals is recased, so a deliberately mixed one ("ONE PIECE FILM edition")
// is left as written, and so is any word with a digit ("GEAR5", "3D2Y"). A
// starter's leading deck colour ("RED Shanks", "PURPLE/BLACK Monkey.D.Luffy")
// is recased on its own. Brand phrases keep their capitals.
export function englishTitle(title: string): string {
  const words = title.split(" ");
  const lettered = words.filter((w) => !/\d/.test(w) && /[A-Za-z]/.test(w));
  if (lettered.length > 0 && lettered.every((w) => w === w.toUpperCase())) {
    return recase(title);
  }
  const [first, ...rest] = words;
  if (first && first.split("/").every((c) => COLOR_WORDS.has(c))) {
    return [first.split("/").map(capitalise).join("/"), ...rest].join(" ");
  }
  return title;
}

function capitalise(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

function recase(title: string): string {
  // Brand phrases are swapped out first so no word inside one is recased.
  const kept: string[] = [];
  let text = title;
  for (const phrase of BRAND_PHRASES) {
    text = text.replace(new RegExp(`\\b${phrase}\\b`, "g"), () => `\u0000${kept.push(phrase) - 1}\u0000`);
  }
  const out = text
    .split(" ")
    .map((word, i) => {
      // "KAMI’S" -> "KAMI’s": the brand stays, what follows it does not.
      if (word.includes("\u0000")) {
        const end = word.lastIndexOf("\u0000") + 1;
        return word.slice(0, end) + word.slice(end).toLowerCase();
      }
      if (/\d/.test(word)) return word;
      // "SEA’S" -> "Sea’s": the possessive s is not a word start.
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return capitalise(word);
    })
    .join(" ");
  return out.replace(/\u0000(\d+)\u0000/g, (_, n: string) => kept[Number(n)]);
}

// The set's title from its products: an English site's name first, then any
// product's own name_en (written by the data repo, so used as it is), then
// the other sites' names.
function setTitle(products: ProductInput[]): string | null {
  const english = ENGLISH_SITES.map((s) => products.find((p) => p.site === s)).find(Boolean);
  if (english) return englishTitle(productTitle(english.name)) || null;
  const nameEn = products.find((p) => p.name_en)?.name_en;
  if (nameEn) return nameEn;
  const other = OTHER_SITES.map((s) => products.find((p) => p.site === s)).find(Boolean);
  return (other && productTitle(other.name)) || null;
}

// "BOOSTER PACK -Royal Blood- [OP-10]" -> "Royal Blood" (en).
// "スタートデッキ 麦わらの一味【ST-01】" -> "スタートデッキ 麦わらの一味" (jp).
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

// The set's date from one site: the earliest dated product it has there. Only a
// full YYYY-MM-DD counts; the data repo refuses anything else, and a stray
// partial date here reads as undated rather than sorting as a string.
function siteDate(products: ProductInput[], site: ReleaseSite): string | null {
  const dates = products
    .filter((p) => p.site === site && p.release_date && /^\d{4}-\d{2}-\d{2}$/.test(p.release_date))
    .map((p) => p.release_date!);
  return dates.length ? dates.sort()[0] : null;
}

function compareSets(a: Omit<SetGroup, "order">, b: Omit<SetGroup, "order">): number {
  const byKind = SET_KIND_ORDER.indexOf(a.kind) - SET_KIND_ORDER.indexOf(b.kind);
  if (byKind !== 0) return byKind;
  if (a.release_date !== b.release_date) {
    if (a.release_date === null || b.release_date === null) return a.release_date === null ? 1 : -1;
    return b.release_date.localeCompare(a.release_date);
  }
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
      title = setTitle(g.products) ?? g.code;
    }
    const en = siteDate(g.products, "en");
    const jp = en === null ? siteDate(g.products, "jp") : null;
    return {
      slug,
      code: g.code,
      kind: g.kind,
      title,
      product_keys: g.products.map((p) => p.key).sort(),
      release_date: en ?? jp,
      release_site: en !== null ? ("en" as const) : jp !== null ? ("jp" as const) : null,
    };
  });
  return groups.sort(compareSets).map((g, order) => ({ ...g, order }));
}
