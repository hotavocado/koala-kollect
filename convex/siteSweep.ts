import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { rebuildCardSets } from "./cardSets";

// Sweeps the rows of retired sites that the sync leaves behind. retireBatch
// already deleted their printings and every row on a printing's key, but the
// sync never deletes a row that stops arriving, so their products,
// distributions, card observations (and anything still hanging off those) stay
// until this runs.
//
// One page per mutation, so each stays well inside Convex's per-transaction
// limits; the action drives every step to the end. Dry-run first, then for real:
//   npx convex run siteSweep:sweepRetiredSites '{"dryRun": true}'
//   npx convex run siteSweep:sweepRetiredSites '{"dryRun": false}'
// A second real run finds nothing and deletes nothing.

// The data repo retired these sites (koala-kollect-data #23).
const RETIRED_SITES = ["asia-en", "tc"] as const;
const retiredSite = v.union(...RETIRED_SITES.map((s) => v.literal(s)));

// Each product drags its printing_products rows along, so its page is small.
export const PRODUCT_PAGE = 20;
// Docs scanned, not matched, per page of a table with no site index.
export const SCAN_PAGE = 500;

function isRetired(site: string): boolean {
  return (RETIRED_SITES as readonly string[]).includes(site);
}

// Every page checks this in its own transaction, not just the action at the
// start, so a sync that begins mid-sweep stops the sweep at its next page.
async function refuseWhileSyncing(db: QueryCtx["db"]): Promise<void> {
  const latest = await db.query("data_syncs").withIndex("by_started_at").order("desc").first();
  if (latest?.status === "running") {
    throw new Error(
      `site sweep refused: data_syncs ${latest._id} (${latest.data_commit || "no commit"}, started ${latest.started_at}) is running; run the sweep after it closes`,
    );
  }
}

const page = { cursor: v.union(v.string(), v.null()), dryRun: v.boolean() };

type Page = { continueCursor: string; isDone: boolean };

export const checkNoSync = internalQuery({
  args: {},
  handler: async (ctx): Promise<void> => await refuseWhileSyncing(ctx.db),
});

// A product and its listings go in one transaction, so a listing is never left
// pointing at a product that is gone.
export const sweepProductsPage = internalMutation({
  args: { site: retiredSite, ...page },
  handler: async (ctx, { site, cursor, dryRun }): Promise<Page & { products: number; printing_products: number }> => {
    await refuseWhileSyncing(ctx.db);
    const result = await ctx.db
      .query("products")
      .withIndex("by_site", (q) => q.eq("site", site))
      .paginate({ cursor, numItems: PRODUCT_PAGE });
    let printingProducts = 0;
    for (const product of result.page) {
      const links = await ctx.db
        .query("printing_products")
        .withIndex("by_product", (q) => q.eq("product_key", product.key))
        .collect();
      printingProducts += links.length;
      if (dryRun) continue;
      for (const link of links) await ctx.db.delete(link._id);
      await ctx.db.delete(product._id);
    }
    return {
      products: result.page.length,
      printing_products: printingProducts,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

// No site index on distributions, so this scans and filters. As with products,
// a distribution and its claims go together.
export const sweepDistributionsPage = internalMutation({
  args: page,
  handler: async (ctx, { cursor, dryRun }): Promise<Page & { distributions: number; printing_distributions: number }> => {
    await refuseWhileSyncing(ctx.db);
    const result = await ctx.db.query("distributions").paginate({ cursor, numItems: SCAN_PAGE });
    let distributions = 0;
    let claims = 0;
    for (const dist of result.page) {
      if (!isRetired(dist.site)) continue;
      distributions++;
      const rows = await ctx.db
        .query("printing_distributions")
        .withIndex("by_distribution", (q) => q.eq("distribution_key", dist.key))
        .collect();
      claims += rows.length;
      if (dryRun) continue;
      for (const row of rows) await ctx.db.delete(row._id);
      await ctx.db.delete(dist._id);
    }
    return { distributions, printing_distributions: claims, continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

// Both are plain scans: filtering inside the query would let one page read
// the whole table looking for matches.
async function sweepRows(
  ctx: MutationCtx,
  rows: (Doc<"card_observations"> | Doc<"printing_locators">)[],
  dryRun: boolean,
): Promise<number> {
  let n = 0;
  for (const row of rows) {
    if (!isRetired(row.site)) continue;
    n++;
    if (!dryRun) await ctx.db.delete(row._id);
  }
  return n;
}

export const sweepObservationsPage = internalMutation({
  args: page,
  handler: async (ctx, { cursor, dryRun }): Promise<Page & { card_observations: number }> => {
    await refuseWhileSyncing(ctx.db);
    const result = await ctx.db.query("card_observations").paginate({ cursor, numItems: SCAN_PAGE });
    const n = await sweepRows(ctx, result.page, dryRun);
    return { card_observations: n, continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

// retireBatch takes a printing's locators with it, so this should find none.
export const sweepLocatorsPage = internalMutation({
  args: page,
  handler: async (ctx, { cursor, dryRun }): Promise<Page & { printing_locators: number }> => {
    await refuseWhileSyncing(ctx.db);
    const result = await ctx.db.query("printing_locators").paginate({ cursor, numItems: SCAN_PAGE });
    const n = await sweepRows(ctx, result.page, dryRun);
    return { printing_locators: n, continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

// Counted, never deleted: a printing must go through retireBatch so its
// product listings, claims, locators and links go with it.
export const countPrintingsPage = internalQuery({
  args: { site: retiredSite, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { site, cursor }): Promise<Page & { printings: number }> => {
    const result = await ctx.db
      .query("printings")
      .withIndex("by_site", (q) => q.eq("site", site))
      .paginate({ cursor, numItems: SCAN_PAGE });
    return { printings: result.page.length, continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

type SweepResult = {
  dryRun: boolean;
  products: number;
  printing_products: number;
  distributions: number;
  printing_distributions: number;
  card_observations: number;
  printing_locators: number;
  printings_remaining: number;
  rebuild?: { sets: number; pruned: number };
};

// Pages through one step until it is done, summing every count it returns.
async function drain<R extends Page>(next: (cursor: string | null) => Promise<R>, add: (r: R) => void): Promise<void> {
  let cursor: string | null = null;
  for (;;) {
    const r = await next(cursor);
    add(r);
    if (r.isDone) return;
    cursor = r.continueCursor;
  }
}

export const sweepRetiredSites = internalAction({
  args: { dryRun: v.boolean() },
  handler: async (ctx, { dryRun }): Promise<SweepResult> => {
    await ctx.runQuery(internal.siteSweep.checkNoSync, {});
    const out: SweepResult = {
      dryRun,
      products: 0,
      printing_products: 0,
      distributions: 0,
      printing_distributions: 0,
      card_observations: 0,
      printing_locators: 0,
      printings_remaining: 0,
    };
    for (const site of RETIRED_SITES) {
      await drain(
        (cursor) => ctx.runMutation(internal.siteSweep.sweepProductsPage, { site, cursor, dryRun }),
        (r) => {
          out.products += r.products;
          out.printing_products += r.printing_products;
        },
      );
    }
    await drain(
      (cursor) => ctx.runMutation(internal.siteSweep.sweepDistributionsPage, { cursor, dryRun }),
      (r) => {
        out.distributions += r.distributions;
        out.printing_distributions += r.printing_distributions;
      },
    );
    await drain(
      (cursor) => ctx.runMutation(internal.siteSweep.sweepObservationsPage, { cursor, dryRun }),
      (r) => (out.card_observations += r.card_observations),
    );
    await drain(
      (cursor) => ctx.runMutation(internal.siteSweep.sweepLocatorsPage, { cursor, dryRun }),
      (r) => (out.printing_locators += r.printing_locators),
    );
    for (const site of RETIRED_SITES) {
      await drain(
        (cursor) => ctx.runQuery(internal.siteSweep.countPrintingsPage, { site, cursor }),
        (r) => (out.printings_remaining += r.printings),
      );
    }
    const deleted =
      out.products + out.printing_products + out.distributions + out.printing_distributions + out.card_observations + out.printing_locators;
    // Products feed the set index, so it is re-derived once they are gone. A
    // run that deleted nothing changes nothing to re-derive.
    if (!dryRun && deleted > 0) out.rebuild = await rebuildCardSets(ctx);
    return out;
  },
});
