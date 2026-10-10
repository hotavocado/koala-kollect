import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { groupProducts, type ProductInput, type SetGroup } from "./cardSetsCore";

// Rebuilds card_sets, the set index, from the synced products. Counting the
// distinct cards of every set at query time would read the whole printings
// table, over Convex's per-query limit, so the counts are derived here, one
// set per mutation, after each sync that changed the data.
//
// The sync skips a commit it already has, so after a deploy that changes the
// grouping, run this by hand: npx convex run cardSets:rebuild

export const listProducts = internalQuery({
  args: {},
  handler: async (ctx): Promise<ProductInput[]> => {
    const products = await ctx.db.query("products").collect();
    return products.map(({ key, site, code, name, kind, release_date }) => ({ key, site, code, name, kind, release_date }));
  },
});

const setGroup = v.object({
  slug: v.string(),
  code: v.union(v.string(), v.null()),
  kind: v.union(
    v.literal("booster"),
    v.literal("extra"),
    v.literal("premium"),
    v.literal("starter"),
    v.literal("promo"),
    v.literal("limited"),
    v.literal("family"),
    v.literal("other"),
  ),
  title: v.string(),
  product_keys: v.array(v.string()),
  release_date: v.union(v.string(), v.null()),
  release_site: v.union(v.literal("en"), v.literal("jp"), v.null()),
  order: v.number(),
});

// Counts the set's distinct cards (listings that were removed do not count)
// and upserts its row by slug. An unchanged row is not rewritten.
export const upsertSet = internalMutation({
  args: { group: setGroup },
  handler: async (ctx, { group }) => {
    const cards = new Set<string>();
    for (const productKey of group.product_keys) {
      const links = await ctx.db
        .query("printing_products")
        .withIndex("by_product", (q) => q.eq("product_key", productKey))
        .collect();
      for (const link of links) {
        if (link.removed_at !== undefined) continue;
        const printing = await ctx.db
          .query("printings")
          .withIndex("by_key", (q) => q.eq("key", link.printing_key))
          .unique();
        if (printing) cards.add(printing.card_key);
      }
    }
    // DON cards reach a set only through don_sets (see setDon in cards.ts), and
    // the set page lists them, so they count too. The Set keeps a DON the set
    // already lists from being counted twice.
    const placed = await ctx.db
      .query("don_sets")
      .withIndex("by_set_slug", (q) => q.eq("set_slug", group.slug))
      .collect();
    for (const d of placed) {
      if (cards.has(d.key)) continue;
      const card = await ctx.db
        .query("cards")
        .withIndex("by_key", (q) => q.eq("key", d.key))
        .unique();
      if (card) cards.add(d.key);
    }

    const { code, release_date, release_site, ...rest } = group;
    const row = {
      ...rest,
      ...(code === null ? {} : { code }),
      ...(release_date === null ? {} : { release_date }),
      ...(release_site === null ? {} : { release_site }),
      card_count: cards.size,
    };
    const existing = await ctx.db
      .query("card_sets")
      .withIndex("by_slug", (q) => q.eq("slug", group.slug))
      .unique();
    if (existing === null) {
      await ctx.db.insert("card_sets", row);
    } else if (!sameRow(existing, row)) {
      await ctx.db.replace(existing._id, row);
    }
  },
});

function sameRow(existing: Record<string, unknown>, row: Record<string, unknown>): boolean {
  const { _id, _creationTime, ...stored } = existing;
  void _id;
  void _creationTime;
  return JSON.stringify(stored, Object.keys(stored).sort()) === JSON.stringify(row, Object.keys(row).sort());
}

// Deletes the sets whose slug no longer comes out of the grouping.
export const pruneSets = internalMutation({
  args: { keep: v.array(v.string()) },
  handler: async (ctx, { keep }) => {
    const wanted = new Set(keep);
    let deleted = 0;
    for (const row of await ctx.db.query("card_sets").collect()) {
      if (!wanted.has(row.slug)) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    return deleted;
  },
});

// Shared by the action below and dataSync.retireChain, which calls it inline
// rather than running one action from another.
export async function rebuildCardSets(ctx: ActionCtx): Promise<{ sets: number; pruned: number }> {
  const groups: SetGroup[] = groupProducts(await ctx.runQuery(internal.cardSets.listProducts, {}));
  for (const group of groups) {
    await ctx.runMutation(internal.cardSets.upsertSet, { group });
  }
  const pruned = await ctx.runMutation(internal.cardSets.pruneSets, { keep: groups.map((g) => g.slug) });
  return { sets: groups.length, pruned };
}

export const rebuild = internalAction({
  args: {},
  handler: async (ctx) => await rebuildCardSets(ctx),
});
