import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { browseRow, type BrowseCard } from "./cards";
import { MIN_NAME_QUERY, parseCardNumber, SEARCH_LIMIT } from "./cardSearchCore";

// Find a card by number or name. Reads the same mirror tables as the browse
// page and never writes.

// How many name hits to read to fill SEARCH_LIMIT distinct cards. One card has
// an observation per site (four today, five with cn), and a popular name like
// Luffy repeats across many cards, so read well past the limit.
const NAME_SCAN = 200;

export type SearchHit = BrowseCard & {
  // The printed name that matched, when it differs from the name shown, so a
  // search in Japanese can say why an English-named row came back.
  matchedName: string | null;
};

export type SearchResult = {
  kind: "empty" | "number" | "name";
  hits: SearchHit[];
};

export const search = query({
  args: { q: v.string() },
  handler: async (ctx, { q }): Promise<SearchResult> => {
    const text = q.trim();
    if (!text) return { kind: "empty", hits: [] };

    const asNumber = parseCardNumber(text);
    if (asNumber) {
      const cards = await byNumber(ctx, asNumber.exact, asNumber.prefix);
      // A number-shaped query that matches no number may still be a name.
      if (cards.length > 0 || text.length < MIN_NAME_QUERY) {
        return { kind: "number", hits: await hits(ctx, cards, new Map()) };
      }
    }
    const matches = await ctx.db
      .query("card_observations")
      .withSearchIndex("search_name", (s) => s.search("name", text))
      .take(NAME_SCAN);
    // Below the minimum only a whole-name match counts: "z" should not list
    // every Zoro, but 剃, 凶 and the card named Z are real one-character names.
    const short = text.length < MIN_NAME_QUERY;
    const lower = text.toLowerCase();
    // Relevance order, one row per card. An errata'd observation still names
    // its card, so superseded rows count too.
    const matched = new Map<string, string>();
    for (const o of matches) {
      if (short && o.name.toLowerCase() !== lower) continue;
      if (!matched.has(o.card_key)) matched.set(o.card_key, o.name);
      if (matched.size === SEARCH_LIMIT) break;
    }
    const cards = await Promise.all(
      [...matched.keys()].map((key) =>
        ctx.db
          .query("cards")
          .withIndex("by_key", (q) => q.eq("key", key))
          .unique(),
      ),
    );
    return {
      kind: "name",
      hits: await hits(
        ctx,
        cards.filter((c): c is Doc<"cards"> => c !== null),
        matched,
      ),
    };
  },
});

// Exact numbers first, then the prefix range in number order, no repeats.
async function byNumber(ctx: QueryCtx, exact: string[], prefix: string): Promise<Doc<"cards">[]> {
  const out: Doc<"cards">[] = [];
  const seen = new Set<string>();
  for (const number of exact) {
    const card = await ctx.db
      .query("cards")
      .withIndex("by_number", (q) => q.eq("number", number))
      .first();
    if (card && !seen.has(card.key)) {
      out.push(card);
      seen.add(card.key);
    }
  }
  const range = await ctx.db
    .query("cards")
    .withIndex("by_number", (q) => q.gte("number", prefix).lt("number", `${prefix}￿`))
    .take(SEARCH_LIMIT + exact.length);
  for (const card of range) {
    if (out.length === SEARCH_LIMIT) break;
    if (!seen.has(card.key)) {
      out.push(card);
      seen.add(card.key);
    }
  }
  return out;
}

async function hits(ctx: QueryCtx, cards: Doc<"cards">[], matched: Map<string, string>): Promise<SearchHit[]> {
  return Promise.all(
    cards.map(async (card) => {
      const row = await browseRow(ctx, card);
      const name = matched.get(card.key) ?? null;
      return { ...row, matchedName: name !== null && name !== row.name ? name : null };
    }),
  );
}
