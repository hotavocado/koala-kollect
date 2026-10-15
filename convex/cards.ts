import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { locale, SITE_ORDER, type Locale } from "./lang";

// Public reads for the browse page. Every table here is a mirror written only
// by dataSync, so these queries never write and never take a user.
//
// Each takes the reader's language, optional so a client from before it
// existed keeps working through a deploy. It picks whose printed text to show
// (lang.ts SITE_ORDER); the rules facts are the same in every language.

type SiteOrder = readonly Doc<"card_observations">["site"][];

export type BrowseCard = {
  key: string;
  number: string | null;
  donDesign: string | null;
  category: Doc<"cards">["category"];
  colors: Doc<"cards">["colors"];
  name: string | null;
  // The site whose printed name is shown, so the page can mark its language.
  // Null when there is no name, or it came from a summary stored before
  // summaries kept one name per site.
  nameSite: Doc<"card_observations">["site"] | null;
  imageUrl: string | null;
  printings: number;
};

// The current observation whose printed text the page shows. An errata closes
// the old row, so only rows with no superseded_at are candidates.
function pickObservation(
  observations: Doc<"card_observations">[],
  order: SiteOrder = SITE_ORDER.en,
): Doc<"card_observations"> | null {
  const current = observations.filter((o) => o.superseded_at === undefined);
  for (const site of order) {
    const hit = current.find((o) => o.site === site);
    if (hit) return hit;
  }
  return null;
}

export function pickName(observations: Doc<"card_observations">[]): string | null {
  return pickObservation(observations)?.name ?? null;
}

// A DON's normal-finish printing stands where a numbered card's base does.
function isBase(variant: Doc<"printings">["variant"]): boolean {
  return variant === "base" || variant === "normal";
}

// Base printings first, then the same site order as the name, so the image
// and name usually agree.
function rankPrintings(printings: Doc<"printings">[], order: SiteOrder): Doc<"printings">[] {
  const siteRank = (s: Doc<"printings">["site"]) => {
    const i = order.indexOf(s);
    return i === -1 ? order.length : i;
  };
  return [...printings].sort(
    (a, b) =>
      Number(!isBase(a.variant)) - Number(!isBase(b.variant)) || siteRank(a.site) - siteRank(b.site),
  );
}

// The card's image: the best-ranked printing that has one. A tcgcsv printing
// has none until TCGplayer lists an image, and the card then shows its text face.
export function cardImage(printings: Doc<"printings">[], order: SiteOrder = SITE_ORDER.en): string | null {
  return rankPrintings(printings, order).find((p) => p.image_url !== undefined)?.image_url ?? null;
}

// Official card lists that search by card number through ?freewords=. cn's
// list is an API with no search page, and tcgcsv is not an official list (its
// printings link to their TCGplayer product page instead), so neither gets a
// link.
const LIST_HOST: Partial<Record<Doc<"printings">["site"], string>> = {
  en: "en.onepiece-cardgame.com",
  jp: "www.onepiece-cardgame.com",
};

// The card's entry on one site's official list. The image hosts refuse
// cross-site loads (Cross-Origin-Resource-Policy: same-site), so these links
// are how a visitor sees the real card.
function listUrl(site: Doc<"printings">["site"], number: string | undefined): string | null {
  const host = LIST_HOST[site];
  return host && number ? `https://${host}/cardlist/?freewords=${encodeURIComponent(number)}` : null;
}

export const browse = query({
  args: { paginationOpts: paginationOptsValidator, lang: v.optional(locale) },
  handler: async (ctx, { paginationOpts, lang = "en" }) => {
    // by_number puts numbered cards in card-number order. DON cards have no
    // number, so they sort before every numbered card.
    const page = await ctx.db.query("cards").withIndex("by_number").paginate(paginationOpts);
    const rows: BrowseCard[] = await Promise.all(page.page.map((card) => browseRow(ctx, card, lang)));
    return { ...page, page: rows };
  },
});

// One tile's worth of a card: the shown name, the best image, the printing count.
// imageFrom narrows the tile image to the printings a set lists, so a reprint
// or parallel shows the art that set carries rather than the card's base art.
export async function browseRow(
  ctx: QueryCtx,
  card: Doc<"cards">,
  lang: Locale,
  imageFrom?: Doc<"printings">[],
): Promise<BrowseCard> {
  const order = SITE_ORDER[lang];
  const row = {
    key: card.key,
    number: card.number ?? null,
    donDesign: card.don_design ?? null,
    category: card.category,
    colors: card.colors,
  };
  // The stored summary saves reading every observation and printing of the
  // card: on the promo set page those were about two thirds of the reads.
  // imageFrom is printings the caller already holds, so it costs nothing.
  // The stored image is English-first whatever the language: one per card.
  const summary = card.summary;
  if (summary) {
    const names = summary.names;
    const nameSite = names ? (order.find((s) => names[s] !== undefined) ?? null) : null;
    return {
      ...row,
      // A summary from before names: its English-first name, language unknown.
      name: names ? (nameSite ? (names[nameSite] ?? null) : null) : summary.name,
      nameSite,
      imageUrl: imageFrom?.length ? cardImage(imageFrom, order) : summary.image_url,
      printings: summary.printings,
    };
  }
  // No summary yet (a card the chain has not reached): read them live.
  const [observations, printings] = await Promise.all([
    ctx.db
      .query("card_observations")
      .withIndex("by_card_site", (q) => q.eq("card_key", card.key))
      .collect(),
    ctx.db
      .query("printings")
      .withIndex("by_card", (q) => q.eq("card_key", card.key))
      .collect(),
  ]);
  const shown = pickObservation(observations, order);
  return {
    ...row,
    name: shown?.name ?? null,
    nameSite: shown?.site ?? null,
    imageUrl: cardImage(imageFrom?.length ? imageFrom : printings, order),
    printings: printings.length,
  };
}

// The set index: one row per product code across sites, plus the promotion,
// limited and family buckets, in card_sets order (kind, then newest code).
export type CardSetRow = {
  slug: string;
  code: string | null;
  kind: Doc<"card_sets">["kind"];
  title: string;
  cardCount: number;
  releaseDate: string | null;
  releaseSite: "en" | "jp" | null;
};

// The title in the reader's language when the set has a product there, by the
// same order as card names. A row rebuilt before titles existed has only title.
function setRow(set: Doc<"card_sets">, lang: Locale): CardSetRow {
  const titles: Partial<Record<Doc<"card_observations">["site"], string>> = set.titles ?? {};
  return {
    slug: set.slug,
    code: set.code ?? null,
    kind: set.kind,
    title: SITE_ORDER[lang].map((s) => titles[s]).find((t) => t !== undefined) ?? set.title,
    cardCount: set.card_count,
    releaseDate: set.release_date ?? null,
    releaseSite: set.release_site ?? null,
  };
}

export const sets = query({
  args: { lang: v.optional(locale) },
  handler: async (ctx, { lang = "en" }): Promise<CardSetRow[]> => {
    const rows = await ctx.db.query("card_sets").withIndex("by_order").collect();
    return rows.map((set) => setRow(set, lang));
  },
});

// One set's cards in card-number order. The biggest set (promotion cards
// across four sites) reads about ten thousand documents, inside the limit.
// The card-number prefixes a set prints under its own code: OP-10 prints
// OP10-xxx, and en's combined OP14-EB04 prints both OP14-xxx and EB04-xxx.
// Anything else listed under the set (SP and reprint cards) comes from another set.
export function ownPrefixes(code: string | null): string[] {
  if (code === null) return [];
  return /^[A-Z]+-\d+$/.test(code) ? [code.replace("-", "")] : code.split("-");
}

// DON cards placed on this set by data/don_sets.jsonl. No official site lists
// DON under a product, so they reach a set only through don_sets, never through
// printing_products; a card the set already lists stays where it is. The
// thumbnail is the DON's own tcgcsv printing. Ordered by design.
async function setDon(
  ctx: QueryCtx,
  slug: string,
  lang: Locale,
  listed: Map<string, unknown>,
): Promise<BrowseCard[]> {
  const placed = await ctx.db
    .query("don_sets")
    .withIndex("by_set_slug", (q) => q.eq("set_slug", slug))
    .collect();
  const rows = await Promise.all(
    placed
      .filter((d) => !listed.has(d.key))
      .map(async (d) => {
        const [card, printings] = await Promise.all([
          ctx.db
            .query("cards")
            .withIndex("by_key", (q) => q.eq("key", d.key))
            .unique(),
          Promise.all(
            d.printing_keys.map((k) =>
              ctx.db
                .query("printings")
                .withIndex("by_key", (q) => q.eq("key", k))
                .unique(),
            ),
          ),
        ]);
        return card ? browseRow(ctx, card, lang, printings.filter((p) => p !== null)) : null;
      }),
  );
  return rows
    .filter((r) => r !== null)
    .sort(
      (a, b) =>
        (a.donDesign ?? "").localeCompare(b.donDesign ?? "", "en", { numeric: true }) || a.key.localeCompare(b.key),
    );
}

export const setCards = query({
  args: { slug: v.string(), lang: v.optional(locale) },
  handler: async (
    ctx,
    { slug, lang = "en" },
  ): Promise<{ set: CardSetRow; cards: BrowseCard[]; fromOtherSets: BrowseCard[]; don: BrowseCard[] } | null> => {
    const set = await ctx.db
      .query("card_sets")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!set) return null;

    const linked = new Map<string, Doc<"printings">[]>();
    for (const productKey of set.product_keys) {
      const links = await ctx.db
        .query("printing_products")
        .withIndex("by_product", (q) => q.eq("product_key", productKey))
        .collect();
      const printings = await Promise.all(
        links
          .filter((l) => l.removed_at === undefined)
          .map((l) =>
            ctx.db
              .query("printings")
              .withIndex("by_key", (q) => q.eq("key", l.printing_key))
              .unique(),
          ),
      );
      for (const p of printings) if (p) linked.set(p.card_key, [...(linked.get(p.card_key) ?? []), p]);
    }

    const cards = await Promise.all(
      [...linked.keys()].map((key) =>
        ctx.db
          .query("cards")
          .withIndex("by_key", (q) => q.eq("key", key))
          .unique(),
      ),
    );
    const rows = await Promise.all(cards.flatMap((c) => (c ? [browseRow(ctx, c, lang, linked.get(c.key))] : [])));
    // Numbered cards by number (numeric, so -9 before -10), then DON by design.
    rows.sort(
      (a, b) =>
        (a.number === null ? 1 : 0) - (b.number === null ? 1 : 0) ||
        (a.number ?? a.donDesign ?? "").localeCompare(b.number ?? b.donDesign ?? "", "en", { numeric: true }) ||
        a.key.localeCompare(b.key),
    );
    // A set with no code (the promotion buckets) has no own prefix, so all its
    // cards stay in the main list. So does a set made mostly of other sets'
    // cards (PRB-01 prints one card of its own and reprints 110): splitting it
    // would leave a near-empty main list.
    const own = ownPrefixes(set.code ?? null);
    const isOwn = (c: BrowseCard) => own.length === 0 || own.includes(c.number?.split("-")[0] ?? "");
    const ownCards = rows.filter(isOwn);
    const don = await setDon(ctx, slug, lang, linked);
    if (ownCards.length * 2 < rows.length) return { set: setRow(set, lang), cards: rows, fromOtherSets: [], don };
    return { set: setRow(set, lang), cards: ownCards, fromOtherSets: rows.filter((c) => !isOwn(c)), don };
  },
});

// The newest sync attempt, so an empty browse page can say why it is empty
// instead of looking broken. The refusal text stays server-side: the page only
// needs to know that a sync ran and how it ended.
export const lastSync = query({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db.query("data_syncs").withIndex("by_started_at").order("desc").first();
    if (!latest) return null;
    return {
      status: latest.status,
      startedAt: latest.started_at,
      finishedAt: latest.finished_at ?? null,
      upserted: latest.upserted ?? null,
    };
  },
});

// The card page: rules facts, the printed text, and every printing grouped by
// the site that lists it, each with its verbatim provenance string, the series
// pages it sits under, and the claims about where it was handed out.

// The card page groups printings by language, not by site. tcgcsv is a
// TCGplayer catalogue, not a language, and its only One Piece category is
// English, so its DON printings and the stamped Release Event prints no
// official list carries sit under English, after the official en printings.
export type Language = Exclude<Doc<"printings">["site"], "tcgcsv">;
const LANGUAGE_OF: Record<Doc<"printings">["site"], Language> = {
  en: "en",
  jp: "jp",
  cn: "cn",
  tcgcsv: "en",
};
// Language order on the page: English first, as on the browse page.
const LANGUAGE_ORDER: Language[] = ["en", "jp", "cn"];
// Within a language, the official list's printings before TCGplayer's.
const REGION_ORDER: Doc<"printings">["site"][] = ["en", "jp", "cn", "tcgcsv"];
const VARIANT_ORDER: Doc<"printings">["variant"][] = [
  "base",
  "normal",
  "foil",
  "parallel",
  "alt_art",
  "gold",
  "manga",
  "serial",
  "reprint",
  "stamped",
  "other",
];
const CONFIDENCE_ORDER: Doc<"printing_distributions">["confidence"][] = [
  "authoritative",
  "corroborated",
  "inferred",
];

export type CardListing = {
  productKey: string;
  // Null when the series page is referenced but its product row has not been
  // synced; the page still shows the listing rather than dropping it.
  code: string | null;
  name: string | null;
  nameEn: string | null;
  releaseDate: string | null;
  removedAt: string | null;
  // A site-wide catch-all series (Promotion card and the like) that stands in
  // for the real products. False when the product row has not synced.
  isBucket: boolean;
  productUrl: string | null;
};

export type CardClaim = {
  key: string;
  source: Doc<"printing_distributions">["source"];
  sourceUrl: string;
  quote: string;
  confidence: Doc<"printing_distributions">["confidence"];
  // What this source page says; another claim on the same pack may differ.
  tier: Doc<"printing_distributions">["tier"] | null;
  startsOn: string | null;
  endsOn: string | null;
  quantityNote: string | null;
  distribution: {
    name: string;
    nameNative: string | null;
    kind: Doc<"distributions">["kind"];
    region: Doc<"distributions">["region"];
  } | null;
};

// Where a print came from, as the page shows it: always a product when a real
// one lists it, else the distribution (a stamped print keeps its competition
// pack). Never both. listings and claims stay on the printing in full; this is
// the one the page leads with.
export type CardOrigin =
  | {
      kind: "product";
      productKey: string;
      code: string | null;
      name: string;
      nameEn: string | null;
      releaseDate: string | null;
      productUrl: string | null;
    }
  | { kind: "distribution"; names: string[] }
  | null;

export type CardPrinting = {
  key: string;
  rarity: string;
  variant: Doc<"printings">["variant"];
  // The site that lists this print. Under English it may be tcgcsv.
  site: Doc<"printings">["site"];
  imageUrl: string | null; // null on a tcgcsv printing TCGplayer has no image for yet
  sourceText: string; // verbatim; empty when the site prints none
  imageIds: string[];
  // A tcgcsv printing's TCGplayer product page; null on every official site.
  tcgplayerUrl: string | null;
  listings: CardListing[];
  claims: CardClaim[];
  origin: CardOrigin;
};

export type CardRegion = {
  language: Language;
  // This language's official list entry for the card, or null where the site
  // has no searchable list (cn) or the card has no number (DON).
  listUrl: string | null;
  printings: CardPrinting[];
};

export type CardDetail = {
  key: string;
  number: string | null;
  donDesign: string | null;
  category: Doc<"cards">["category"];
  colors: Doc<"cards">["colors"];
  cost: number | null;
  life: number | null;
  power: number | null;
  counter: number | null;
  attributes: Doc<"cards">["attributes"];
  factsSite: Doc<"cards">["facts_site"];
  text: {
    site: Doc<"card_observations">["site"];
    name: string;
    types: string[];
    effect: string | null;
    trigger: string | null;
  } | null;
  imageUrl: string | null;
  // The official list entry on the best-ranked site that prints the card.
  officialUrl: string | null;
  regions: CardRegion[];
};

function rank<T>(order: readonly T[], value: T): number {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
}

// Where it is listed now first, then by release, so the original set leads.
export function compareListings(a: CardListing, b: CardListing): number {
  return (
    Number(a.removedAt !== null) - Number(b.removedAt !== null) ||
    // A listing with no known release date sorts after the dated ones.
    (a.releaseDate === null ? 1 : 0) - (b.releaseDate === null ? 1 : 0) ||
    (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "") ||
    a.productKey.localeCompare(b.productKey)
  );
}

// Claims can disagree and all are kept; the strongest is shown first.
export function compareClaims(a: CardClaim, b: CardClaim): number {
  return rank(CONFIDENCE_ORDER, a.confidence) - rank(CONFIDENCE_ORDER, b.confidence) || a.key.localeCompare(b.key);
}

// The origin: the first real product in listing order, else the distinct
// distribution names in claim order, else null. A bucket stands in for the
// real products, so it is skipped here, never dropped from listings: the
// Promo and Limited set pages are built from it. A listing whose product row
// has not synced is not a product. A removed listing still counts, after every
// current one: the print came from that product even if the page dropped it.
export function pickOrigin(listings: CardListing[], claims: CardClaim[]): CardOrigin {
  const product = [...listings]
    .sort(compareListings)
    .find((l): l is CardListing & { name: string } => l.name !== null && !l.isBucket);
  if (product) {
    return {
      kind: "product",
      productKey: product.productKey,
      code: product.code,
      name: product.name,
      nameEn: product.nameEn,
      releaseDate: product.releaseDate,
      productUrl: product.productUrl,
    };
  }
  const names = [
    ...new Set([...claims].sort(compareClaims).flatMap((c) => (c.distribution ? [c.distribution.name] : []))),
  ];
  return names.length > 0 ? { kind: "distribution", names } : null;
}

async function loadPrinting(ctx: QueryCtx, p: Doc<"printings">): Promise<CardPrinting> {
  const [locators, links, evidence] = await Promise.all([
    ctx.db
      .query("printing_locators")
      .withIndex("by_printing", (q) => q.eq("printing_key", p.key))
      .collect(),
    ctx.db
      .query("printing_products")
      .withIndex("by_printing", (q) => q.eq("printing_key", p.key))
      .collect(),
    ctx.db
      .query("printing_distributions")
      .withIndex("by_printing", (q) => q.eq("printing_key", p.key))
      .collect(),
  ]);

  const listings: CardListing[] = await Promise.all(
    links.map(async (link) => {
      const product = await ctx.db
        .query("products")
        .withIndex("by_key", (q) => q.eq("key", link.product_key))
        .unique();
      return {
        productKey: link.product_key,
        code: product?.code ?? null,
        name: product?.name ?? null,
        nameEn: product?.name_en ?? null,
        releaseDate: product?.release_date ?? null,
        removedAt: link.removed_at ?? null,
        isBucket: product?.is_bucket === true,
        productUrl: product?.product_url ?? null,
      };
    }),
  );
  listings.sort(compareListings);

  const claims: CardClaim[] = await Promise.all(
    evidence.map(async (e) => {
      const d = await ctx.db
        .query("distributions")
        .withIndex("by_key", (q) => q.eq("key", e.distribution_key))
        .unique();
      return {
        key: e.key,
        source: e.source,
        sourceUrl: e.source_url,
        quote: e.quote,
        confidence: e.confidence,
        tier: e.tier ?? null,
        startsOn: e.starts_on ?? null,
        endsOn: e.ends_on ?? null,
        quantityNote: e.quantity_note ?? null,
        distribution: d
          ? {
              name: d.name,
              nameNative: d.name_native ?? null,
              kind: d.kind,
              region: d.region,
            }
          : null,
      };
    }),
  );
  claims.sort(compareClaims);

  return {
    key: p.key,
    rarity: p.rarity,
    variant: p.variant,
    site: p.site,
    imageUrl: p.image_url ?? null,
    sourceText: p.source_text,
    imageIds: locators.map((l) => l.image_id).sort(),
    tcgplayerUrl: p.site === "tcgcsv" ? tcgplayerUrl(locators) : null,
    listings,
    claims,
    origin: pickOrigin(listings, claims),
  };
}

// A tcgcsv locator's image id is {productId}:{finish}; Normal and Foil of one
// product share the product page.
function tcgplayerUrl(locators: Doc<"printing_locators">[]): string | null {
  const id = locators.map((l) => l.image_id.match(/^(\d+):/)?.[1]).find(Boolean);
  return id ? `https://www.tcgplayer.com/product/${id}` : null;
}

export type PrintDetail = {
  card: {
    key: string;
    number: string | null;
    donDesign: string | null;
    category: Doc<"cards">["category"];
    colors: Doc<"cards">["colors"];
    name: string | null;
    nameSite: Doc<"card_observations">["site"] | null;
  };
  site: Doc<"printings">["site"];
  language: Language;
  listUrl: string | null;
  printing: CardPrinting;
};

// Whether a print page renders for this printing under this card: the printing
// exists and belongs to the card in the URL, so a print link never renders
// under another card. The sitemap lists prints through the same test.
export function printBelongsTo(p: Doc<"printings"> | null, cardKey: string): p is Doc<"printings"> {
  return p !== null && p.card_key === cardKey;
}

// One print's own page. A printing row is the print: one release on one site,
// so identical-looking reprints and the same promo on two sites stay apart.
export const print = query({
  args: { cardKey: v.string(), printKey: v.string(), lang: v.optional(locale) },
  handler: async (ctx, { cardKey, printKey, lang = "en" }): Promise<PrintDetail | null> => {
    const p = await ctx.db
      .query("printings")
      .withIndex("by_key", (q) => q.eq("key", printKey))
      .unique();
    if (!printBelongsTo(p, cardKey)) return null;
    const card = await ctx.db
      .query("cards")
      .withIndex("by_key", (q) => q.eq("key", cardKey))
      .unique();
    if (!card) return null;
    const [observations, printing] = await Promise.all([
      ctx.db
        .query("card_observations")
        .withIndex("by_card_site", (q) => q.eq("card_key", card.key))
        .collect(),
      loadPrinting(ctx, p),
    ]);
    const shown = pickObservation(observations, SITE_ORDER[lang]);
    return {
      card: {
        key: card.key,
        number: card.number ?? null,
        donDesign: card.don_design ?? null,
        category: card.category,
        colors: card.colors,
        name: shown?.name ?? null,
        nameSite: shown?.site ?? null,
      },
      site: p.site,
      language: LANGUAGE_OF[p.site],
      listUrl: listUrl(p.site, card.number),
      printing,
    };
  },
});

export const detail = query({
  args: { key: v.string(), lang: v.optional(locale) },
  handler: async (ctx, { key, lang = "en" }): Promise<CardDetail | null> => {
    const card = await ctx.db
      .query("cards")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!card) return null;

    const [observations, printings] = await Promise.all([
      ctx.db
        .query("card_observations")
        .withIndex("by_card_site", (q) => q.eq("card_key", card.key))
        .collect(),
      ctx.db
        .query("printings")
        .withIndex("by_card", (q) => q.eq("card_key", card.key))
        .collect(),
    ]);

    const loaded = await Promise.all(
      printings.map(async (p) => ({ site: p.site, printing: await loadPrinting(ctx, p) })),
    );
    // Within a site and variant, image id order (numeric, so _p2 before _p10)
    // is the order the card list itself uses; the key is a hash and reads as
    // random.
    loaded.sort(
      (a, b) =>
        rank(LANGUAGE_ORDER, LANGUAGE_OF[a.site]) - rank(LANGUAGE_ORDER, LANGUAGE_OF[b.site]) ||
        rank(REGION_ORDER, a.site) - rank(REGION_ORDER, b.site) ||
        rank(VARIANT_ORDER, a.printing.variant) - rank(VARIANT_ORDER, b.printing.variant) ||
        (a.printing.imageIds[0] ?? "").localeCompare(b.printing.imageIds[0] ?? "", "en", { numeric: true }) ||
        a.printing.key.localeCompare(b.printing.key),
    );
    const regions: CardRegion[] = [];
    for (const { site, printing } of loaded) {
      const last = regions[regions.length - 1];
      const language = LANGUAGE_OF[site];
      if (last?.language === language) last.printings.push(printing);
      // The link is the first printing's site: an official one when the
      // language has any (they sort first), so English holding only
      // TCGplayer's printings gets no official link.
      else regions.push({ language, listUrl: listUrl(site, card.number), printings: [printing] });
    }

    // Name, types, effect and trigger all from one observation, so the text
    // block reads in one language.
    const order = SITE_ORDER[lang];
    const obs = pickObservation(observations, order);
    const ranked = rankPrintings(printings, order);
    return {
      key: card.key,
      number: card.number ?? null,
      donDesign: card.don_design ?? null,
      category: card.category,
      colors: card.colors,
      cost: card.cost ?? null,
      life: card.life ?? null,
      power: card.power ?? null,
      counter: card.counter ?? null,
      attributes: card.attributes,
      factsSite: card.facts_site,
      text: obs
        ? {
            site: obs.site,
            name: obs.name,
            types: obs.types,
            effect: obs.effect ?? null,
            trigger: obs.trigger ?? null,
          }
        : null,
      imageUrl: cardImage(printings, order),
      officialUrl: ranked.map((p) => listUrl(p.site, card.number)).find(Boolean) ?? null,
      regions,
    };
  },
});
