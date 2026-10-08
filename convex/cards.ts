import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
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
  category: Doc<"cards">["category"];
  colors: Doc<"cards">["colors"];
  name: string | null;
  imageUrl: string | null;
  officialUrl: string | null;
  printings: number;
};

function pickName(observations: Doc<"card_observations">[]): string | null {
  const current = observations.filter((o) => o.superseded_at === undefined);
  for (const site of NAME_SITE_ORDER) {
    const hit = current.find((o) => o.site === site);
    if (hit) return hit.name;
  }
  return null;
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

// The official list entry for the card, on the best-ranked site that prints
// it. The image hosts refuse cross-site loads (Cross-Origin-Resource-Policy:
// same-site), so this link is how a visitor sees the real card.
function pickOfficialUrl(number: string | undefined, ranked: Doc<"printings">[]): string | null {
  if (!number) return null;
  const host = ranked.map((p) => LIST_HOST[p.site]).find(Boolean);
  return host ? `https://${host}/cardlist/?freewords=${encodeURIComponent(number)}` : null;
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
        const ranked = rankPrintings(printings);
        return {
          key: card.key,
          number: card.number ?? null,
          category: card.category,
          colors: card.colors,
          name: pickName(observations),
          imageUrl: ranked[0]?.image_url ?? null,
          officialUrl: pickOfficialUrl(card.number, ranked),
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
