import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { cardImage, pickName } from "./cards";
import { designCounts, type ExclusiveCounts, LANGUAGE_ORDER, readDesigns } from "./designCore";

// Each card's browse-row summary (names, printing and design counts, base
// image), stored on the card so browseRow reads the card alone. Recomputed
// over every card after
// each ok sync, in batches, by an action that stops after SUMMARY_BUDGET_MS and
// schedules the next, like dataSync.retireChain. Only a changed summary is
// written, so a sync that changed nothing costs reads only.
//
// Run by hand (a first backfill, or after a failed chain):
//   npx convex run cardSummary:chain '{}'

const SUMMARY_BATCH_SIZE = 100;
const SUMMARY_BUDGET_MS = 5 * 60 * 1000;

type Summary = NonNullable<Doc<"cards">["summary"]>;
type Names = NonNullable<Summary["names"]>;
const NAME_SITES = ["en", "jp", "cn", "tcgcsv"] as const satisfies (keyof Names)[];

// Each site's current printed name. An errata closes the old row, so only rows
// with no superseded_at count.
function namesBySite(observations: Doc<"card_observations">[]): Names {
  const names: Names = {};
  for (const o of observations) {
    if (o.superseded_at === undefined && names[o.site] === undefined) names[o.site] = o.name;
  }
  return names;
}

async function summarize(ctx: MutationCtx, card: Doc<"cards">): Promise<Summary> {
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
  const designOf = await readDesigns(ctx.db, card.key, printings);
  return {
    name: pickName(observations),
    names: namesBySite(observations),
    printings: printings.length,
    image_url: cardImage(printings),
    ...designCounts(printings, designOf),
  };
}

// A stored summary with no names is never the same, so the chain rewrites
// every card once after names were added; one with no design counts differs
// on them, for the same rewrite.
function sameSummary(a: Summary | undefined, b: Summary): boolean {
  if (a === undefined || a.names === undefined || b.names === undefined) return false;
  const { names: x } = a;
  const { names: y } = b;
  return (
    a.name === b.name &&
    NAME_SITES.every((s) => x[s] === y[s]) &&
    a.printings === b.printings &&
    a.image_url === b.image_url &&
    a.designs === b.designs &&
    a.languages === b.languages &&
    a.unreviewed === b.unreviewed &&
    sameExclusive(a.exclusive, b.exclusive)
  );
}

// An absent count is zero, so a summary stored before exclusive counts is not
// rewritten for a card that has none.
function sameExclusive(a: ExclusiveCounts | undefined, b: ExclusiveCounts | undefined): boolean {
  return LANGUAGE_ORDER.every((l) => (a?.[l] ?? 0) === (b?.[l] ?? 0));
}

// One page of cards in _id order. Returns how many summaries changed and where
// the next page starts.
export const batch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("cards").paginate({ cursor, numItems: SUMMARY_BATCH_SIZE });
    let changed = 0;
    for (const card of page.page) {
      const summary = await summarize(ctx, card);
      if (sameSummary(card.summary, summary)) continue;
      await ctx.db.patch(card._id, { summary });
      changed++;
    }
    return { changed, cursor: page.continueCursor, done: page.isDone };
  },
});

export const stamp = internalMutation({
  args: { syncId: v.id("data_syncs"), changed: v.number() },
  handler: async (ctx, { syncId, changed }) => {
    if (!(await ctx.db.get(syncId))) return;
    await ctx.db.patch(syncId, {
      summarized_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      summarized_cards: changed,
    });
  },
});

// The env var can only shorten the budget (tests set 0): above the default, an
// invocation could hit the 10-minute action limit before it schedules the
// next, and the cursor would die with it.
function budgetMs(): number {
  const ms = Number(process.env.KK_SUMMARY_BUDGET_MS ?? NaN);
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, SUMMARY_BUDGET_MS) : SUMMARY_BUDGET_MS;
}

export const chain = internalAction({
  args: {
    syncId: v.optional(v.id("data_syncs")),
    cursor: v.optional(v.union(v.string(), v.null())),
    changed: v.optional(v.number()),
  },
  handler: async (ctx, { syncId, cursor = null, changed = 0 }): Promise<void> => {
    const started = Date.now();
    const budget = budgetMs();
    let at = cursor;
    let first = true;
    // At least one batch per invocation, so the chain always moves.
    while (first || Date.now() - started < budget) {
      first = false;
      const r = await ctx.runMutation(internal.cardSummary.batch, { cursor: at });
      changed += r.changed;
      at = r.cursor;
      if (r.done) {
        if (syncId) await ctx.runMutation(internal.cardSummary.stamp, { syncId, changed });
        return;
      }
    }
    await ctx.scheduler.runAfter(0, internal.cardSummary.chain, { syncId, cursor: at, changed });
  },
});
