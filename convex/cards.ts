import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// Public reads for the browse page. Every table here is a mirror written only
// by dataSync, so these queries never write and never take a user.

// Whose printed name to show when a card has several current observations.
// English first because the browse page is in English; JP before the Chinese
// sites because JP is the authority for card facts.
const NAME_SITE_ORDER: Doc<"card_observations">["site"][] = ["en", "asia-en", "jp", "tc", "cn"];

export type BrowseCard = {
  key: string;
  number: string | null;
  donDesign: string | null;
  category: Doc<"cards">["category"];
  colors: Doc<"cards">["colors"];
  name: string | null;
  imageUrl: string | null;
  printings: number;
};

// The current observation whose printed text the page shows. An errata closes
// the old row, so only rows with no superseded_at are candidates.
function pickObservation(observations: Doc<"card_observations">[]): Doc<"card_observations"> | null {
  const current = observations.filter((o) => o.superseded_at === undefined);
  for (const site of NAME_SITE_ORDER) {
    const hit = current.find((o) => o.site === site);
    if (hit) return hit;
  }
  return null;
}

function pickName(observations: Doc<"card_observations">[]): string | null {
  return pickObservation(observations)?.name ?? null;
}

// Base printings first, then the same site order as the name, so the image
// and name usually agree.
function rankPrintings(printings: Doc<"printings">[]): Doc<"printings">[] {
  const siteRank = (s: Doc<"printings">["site"]) => {
    const i = (NAME_SITE_ORDER as string[]).indexOf(s);
    return i === -1 ? NAME_SITE_ORDER.length : i;
  };
  return [...printings].sort(
    (a, b) =>
      Number(a.variant !== "base") - Number(b.variant !== "base") || siteRank(a.site) - siteRank(b.site),
  );
}

// Official card lists that search by card number through ?freewords=. cn's
// list is an API with no search page, and tcgcsv only locates DON printings,
// so neither gets a link.
const LIST_HOST: Partial<Record<Doc<"printings">["site"], string>> = {
  en: "en.onepiece-cardgame.com",
  "asia-en": "asia-en.onepiece-cardgame.com",
  jp: "www.onepiece-cardgame.com",
  tc: "asia-tc.onepiece-cardgame.com",
};

// The card's entry on one site's official list. The image hosts refuse
// cross-site loads (Cross-Origin-Resource-Policy: same-site), so these links
// are how a visitor sees the real card.
function listUrl(site: Doc<"printings">["site"], number: string | undefined): string | null {
  const host = LIST_HOST[site];
  return host && number ? `https://${host}/cardlist/?freewords=${encodeURIComponent(number)}` : null;
}

export const browse = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    // by_number puts numbered cards in card-number order. DON cards have no
    // number, so they sort before every numbered card.
    const page = await ctx.db.query("cards").withIndex("by_number").paginate(paginationOpts);
    const rows: BrowseCard[] = await Promise.all(
      page.page.map(async (card) => {
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
        return {
          key: card.key,
          number: card.number ?? null,
          donDesign: card.don_design ?? null,
          category: card.category,
          colors: card.colors,
          name: pickName(observations),
          imageUrl: rankPrintings(printings)[0]?.image_url ?? null,
          printings: printings.length,
        };
      }),
    );
    return { ...page, page: rows };
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

// Region order on the page: English first, as on the browse page, then the
// other official sites, then tcgcsv, which only ever carries DON printings.
const REGION_ORDER: Doc<"printings">["site"][] = ["en", "asia-en", "jp", "tc", "cn", "tcgcsv"];
const VARIANT_ORDER: Doc<"printings">["variant"][] = [
  "base",
  "parallel",
  "alt_art",
  "gold",
  "manga",
  "serial",
  "reprint",
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
};

export type CardClaim = {
  key: string;
  source: Doc<"printing_distributions">["source"];
  sourceUrl: string;
  quote: string;
  confidence: Doc<"printing_distributions">["confidence"];
  distribution: {
    name: string;
    nameNative: string | null;
    kind: Doc<"distributions">["kind"];
    region: Doc<"distributions">["region"];
    tier: Doc<"distributions">["tier"] | null;
    startsOn: string | null;
    endsOn: string | null;
  } | null;
};

export type CardPrinting = {
  key: string;
  rarity: string;
  variant: Doc<"printings">["variant"];
  imageUrl: string;
  sourceText: string; // verbatim; empty when the site prints none
  imageIds: string[];
  listings: CardListing[];
  claims: CardClaim[];
};

export type CardRegion = {
  site: Doc<"printings">["site"];
  // This site's official list entry for the card, or null where the site has
  // no searchable list (cn, tcgcsv) or the card has no number (DON).
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
      };
    }),
  );
  // Where it is listed now first, then by release, so the original set leads.
  listings.sort(
    (a, b) =>
      Number(a.removedAt !== null) - Number(b.removedAt !== null) ||
      // A listing with no known release date sorts after the dated ones.
      (a.releaseDate === null ? 1 : 0) - (b.releaseDate === null ? 1 : 0) ||
      (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "") ||
      a.productKey.localeCompare(b.productKey),
  );

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
        distribution: d
          ? {
              name: d.name,
              nameNative: d.name_native ?? null,
              kind: d.kind,
              region: d.region,
              tier: d.tier ?? null,
              startsOn: d.starts_on ?? null,
              endsOn: d.ends_on ?? null,
            }
          : null,
      };
    }),
  );
  // Claims can disagree and all are kept; the strongest is shown first.
  claims.sort(
    (a, b) =>
      rank(CONFIDENCE_ORDER, a.confidence) - rank(CONFIDENCE_ORDER, b.confidence) ||
      a.key.localeCompare(b.key),
  );

  return {
    key: p.key,
    rarity: p.rarity,
    variant: p.variant,
    imageUrl: p.image_url,
    sourceText: p.source_text,
    imageIds: locators.map((l) => l.image_id).sort(),
    listings,
    claims,
  };
}

export const detail = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<CardDetail | null> => {
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
        rank(REGION_ORDER, a.site) - rank(REGION_ORDER, b.site) ||
        rank(VARIANT_ORDER, a.printing.variant) - rank(VARIANT_ORDER, b.printing.variant) ||
        (a.printing.imageIds[0] ?? "").localeCompare(b.printing.imageIds[0] ?? "", "en", { numeric: true }) ||
        a.printing.key.localeCompare(b.printing.key),
    );
    const regions: CardRegion[] = [];
    for (const { site, printing } of loaded) {
      const last = regions[regions.length - 1];
      if (last?.site === site) last.printings.push(printing);
      else regions.push({ site, listUrl: listUrl(site, card.number), printings: [printing] });
    }

    const obs = pickObservation(observations);
    const ranked = rankPrintings(printings);
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
      imageUrl: ranked[0]?.image_url ?? null,
      officialUrl: ranked.map((p) => listUrl(p.site, card.number)).find(Boolean) ?? null,
      regions,
    };
  },
});
