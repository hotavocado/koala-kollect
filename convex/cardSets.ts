import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { groupProducts, type ProductInput, type SetGroup } from "./cardSetsCore";
import { inOtherSet } from "../lib/set-slug";

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
    // Only series pages make set pages. A product minted from source text (no
    // series_id) is a print's origin, not a page: grouped by kind it would join
    // the Limited set, where its release date would date that undated pool and
    // its name could take the pool's title. Its printings already sit in the
    // bucket, so the set's cards do not change.
    const products = (await ctx.db.query("products").collect()).filter((p) => p.series_id !== undefined);
    const sets = new Map<string, string[]>();
    for (const { product_key, set_key } of await ctx.db.query("product_sets").collect()) {
      sets.set(product_key, [...(sets.get(product_key) ?? []), set_key]);
    }
    return products.map(({ key, site, code, name, name_en, kind, release_date }) => ({
      key,
      site,
      code,
      name,
      name_en,
      kind,
      release_date,
      sets: sets.get(key) ?? [],
    }));
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
  titles: v.object({ en: v.optional(v.string()), jp: v.optional(v.string()), cn: v.optional(v.string()) }),
  product_keys: v.array(v.string()),
  aliases: v.array(v.string()),
  shared: v.array(v.object({ product_key: v.string(), other_sets: v.array(v.string()) })),
  release_date: v.union(v.string(), v.null()),
  release_site: v.union(v.literal("en"), v.literal("jp"), v.null()),
  order: v.number(),
});

// Counts the set's distinct cards (listings that were removed do not count,
// nor a shared product's cards numbered for its other set) and upserts its row
// by slug. An unchanged row is not rewritten.
export const upsertSet = internalMutation({
  args: { group: setGroup },
  handler: async (ctx, { group }) => {
    const others = new Map(group.shared.map((s) => [s.product_key, s.other_sets]));
    const cards = new Set<string>();
    for (const productKey of group.product_keys) {
      const otherSets = others.get(productKey);
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
        if (!printing) continue;
        if (otherSets) {
          const card = await ctx.db
            .query("cards")
            .withIndex("by_key", (q) => q.eq("key", printing.card_key))
            .unique();
          if (inOtherSet(card?.number, otherSets)) continue;
        }
        cards.add(printing.card_key);
      }
    }
    // DON cards reach a set only through don_sets (see setDon in cards.ts), and
    // the set page lists them, so they count too. The Set keeps a DON the set
    // already lists from being counted twice. A DON placed on an old slug the
    // set replaced (op14-eb04) is on this page too.
    const placed = [];
    for (const slug of [group.slug, ...group.aliases]) {
      placed.push(
        ...(await ctx.db
          .query("don_sets")
          .withIndex("by_set_slug", (q) => q.eq("set_slug", slug))
          .collect()),
      );
    }
    for (const d of placed) {
      if (cards.has(d.key)) continue;
      const card = await ctx.db
        .query("cards")
        .withIndex("by_key", (q) => q.eq("key", d.key))
        .unique();
      if (card) cards.add(d.key);
    }

    const { code, release_date, release_site, aliases, shared, ...rest } = group;
    const row = {
      ...rest,
      ...(code === null ? {} : { code }),
      ...(aliases.length === 0 ? {} : { aliases }),
      ...(shared.length === 0 ? {} : { shared }),
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
  return JSON.stringify(sortKeys(stored)) === JSON.stringify(sortKeys(row));
}

// Key order at every depth, so titles compare by content. A replacer list of
// the top-level keys would drop titles' own keys and miss a changed title.
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
  );
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
