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

// The card's face on the grid: a base printing if there is one, preferring the
// same site order as the name so the image and name usually agree.
function pickImage(printings: Doc<"printings">[]): string | null {
  const siteRank = (s: Doc<"printings">["site"]) => {
    const i = (NAME_SITE_ORDER as string[]).indexOf(s);
    return i === -1 ? NAME_SITE_ORDER.length : i;
  };
  const sorted = [...printings].sort(
    (a, b) =>
      Number(a.variant !== "base") - Number(b.variant !== "base") || siteRank(a.site) - siteRank(b.site),
  );
  return sorted[0]?.image_url ?? null;
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
          category: card.category,
          colors: card.colors,
          name: pickName(observations),
          imageUrl: pickImage(printings),
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
