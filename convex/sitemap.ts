import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { printBelongsTo } from "./cards";

// The most cards one page reads. Each card brings its printings (about five
// on average), so a page stays far inside Convex's per-query read limits
// whatever numItems a caller asks for.
export const SITEMAP_PAGE_SIZE = 100;

export type SitemapCard = { key: string; prints: string[] };

// Every card page and print page, for app/sitemap.ts, a page at a time. Each
// key listed renders: cards.detail returns null only for a key no card has,
// and every card here is a row of cards. cards.print returns null when the
// printing is missing, belongs to another card, or its card is missing; each
// print here is read through its card's by_card index and passes the same
// printBelongsTo test, so a printing whose card is gone is never listed.
export const cards = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db
      .query("cards")
      .withIndex("by_key")
      .paginate({ ...paginationOpts, numItems: Math.min(paginationOpts.numItems, SITEMAP_PAGE_SIZE) });
    const rows: SitemapCard[] = await Promise.all(
      page.page.map(async (card) => {
        const printings = await ctx.db
          .query("printings")
          .withIndex("by_card", (q) => q.eq("card_key", card.key))
          .collect();
        return { key: card.key, prints: printings.filter((p) => printBelongsTo(p, card.key)).map((p) => p.key) };
      }),
    );
    return { ...page, page: rows };
  },
});
