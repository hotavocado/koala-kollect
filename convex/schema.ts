import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The card tables are a MIRROR of koala-kollect-data (schema/v1.schema.json).
// That repo is the source of truth and the sync writes these tables from its
// JSONL files; nothing in the app writes them directly. Field names match the
// JSON contract exactly, and references are the contract's string keys, never
// v.id(), so a row can be upserted without knowing any other table's _id.
//
// The app-only tables here are data_syncs and card_sets, which is derived from
// the mirror after each sync.

const site = v.union(
  v.literal("en"),
  v.literal("asia-en"),
  v.literal("jp"),
  v.literal("tc"),
  v.literal("cn"),
);
// Where a printing or its locator was read: an official site, or tcgcsv for
// DON printings (no official site lists DON). The contract refuses tcgcsv on
// anything but a DON printing; products and observations keep `site`.
const printingSite = v.union(site, v.literal("tcgcsv"));
const lang = v.union(v.literal("en"), v.literal("ja"), v.literal("zh-Hant"), v.literal("zh-Hans"));
const region = v.union(v.literal("en"), v.literal("asia"), v.literal("jp"), v.literal("cn"));
const color = v.union(
  v.literal("red"),
  v.literal("green"),
  v.literal("blue"),
  v.literal("purple"),
  v.literal("black"),
  v.literal("yellow"),
);
const attribute = v.union(
  v.literal("slash"),
  v.literal("strike"),
  v.literal("ranged"),
  v.literal("special"),
  v.literal("wisdom"),
  v.literal("?"), // printed in place of an attribute (OP13-079 Imu)
);
const category = v.union(
  v.literal("leader"),
  v.literal("character"),
  v.literal("event"),
  v.literal("stage"),
  v.literal("don"),
);
const confidence = v.union(v.literal("authoritative"), v.literal("corroborated"), v.literal("inferred"));

// Shared by cards and card_observations: the rules facts as one site prints them.
const cardFacts = {
  category,
  colors: v.array(color),
  cost: v.optional(v.number()),
  life: v.optional(v.number()),
  power: v.optional(v.number()),
  counter: v.optional(v.number()),
  attributes: v.array(attribute),
  block_icon: v.optional(v.number()),
};

export default defineSchema({
  // Rules identity. Synthetic key. The natural key is number for numbered cards
  // and don_design for DON cards (each DON design is its own card; normal and
  // gold of one design are printings of it). Facts are copied from the jp
  // observation, JP being the authority; DON facts come from tcgcsv.
  cards: defineTable({
    key: v.string(), // card_xxxxxxxxxxxx
    number: v.optional(v.string()), // OP01-001, P-117
    don_design: v.optional(v.string()), // DON only: {first product code}:{art slug}
    ...cardFacts,
    // tcgcsv on DON cards only: no official site lists them. The contract's
    // schema enforces the DON-only rule; this mirror only admits the value.
    facts_site: v.union(site, v.literal("tcgcsv")),
    first_seen_at: v.string(),
  })
    .index("by_key", ["key"])
    .index("by_number", ["number"])
    .index("by_don_design", ["don_design"]),

  // One site's reading of a card, facts and text together, versioned by the hash
  // of the parsed block. An errata closes the old row (superseded_at) and opens a
  // new one; the current row for a site is the one with no superseded_at.
  card_observations: defineTable({
    key: v.string(), // {card_key}:{site}:{observation_hash}
    card_key: v.string(),
    site,
    lang,
    observation_hash: v.string(),
    name: v.string(),
    ...cardFacts,
    types: v.array(v.string()),
    effect: v.optional(v.string()),
    trigger: v.optional(v.string()),
    first_seen_at: v.string(),
    superseded_at: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_card_site", ["card_key", "site"]),

  // One physical print as one site lists it. No removed_at: where it is listed
  // lives on printing_products, and printings move between series pages under
  // the same image id.
  printings: defineTable({
    key: v.string(), // prt_xxxxxxxxxxxx
    card_key: v.string(),
    site: printingSite,
    rarity: v.string(),
    variant: v.union(
      v.literal("base"),
      v.literal("parallel"),
      v.literal("alt_art"),
      v.literal("gold"), // gold DON!!
      v.literal("reprint"),
      v.literal("manga"),
      v.literal("serial"),
      v.literal("other"),
    ),
    image_url: v.string(), // official URL, linked, never re-hosted
    source_text: v.string(), // the verbatim provenance string
    // As printed on this printing on this site: a number, "X" (never rotates
    // out of standard), or null where the site prints none.
    block_icon: v.optional(v.union(v.number(), v.literal("X"), v.null())),
    first_seen_at: v.string(),
  })
    .index("by_key", ["key"])
    .index("by_card", ["card_key"])
    .index("by_site", ["site"]),

  // site:image_id -> printing. Measured stable per site, so one row per printing
  // in practice; a future renumber would be a new row here, not a new printing.
  printing_locators: defineTable({
    key: v.string(), // {site}:{image_id}
    printing_key: v.string(),
    site: printingSite,
    image_id: v.string(), // OP14-108_p3, P-001_p5, ..._r1; cn and tcgcsv: numeric
    suffix_family: v.optional(v.union(v.literal("p"), v.literal("r"))),
    suffix_n: v.optional(v.number()),
    first_seen_at: v.string(),
  })
    .index("by_key", ["key"])
    .index("by_printing", ["printing_key"]),

  products: defineTable({
    key: v.string(), // {site}:{series_id}
    site,
    series_id: v.string(),
    code: v.optional(v.string()), // OP-17, EB-04, OPC-16
    name: v.string(),
    name_en: v.optional(v.string()),
    kind: v.union(
      v.literal("starter"),
      v.literal("booster"),
      v.literal("extra"),
      v.literal("premium"),
      v.literal("family"),
      v.literal("limited"),
      v.literal("promo_bucket"),
      v.literal("other"),
    ),
    release_date: v.optional(v.string()), // YYYY, YYYY-MM or YYYY-MM-DD
    release_date_source: v.optional(v.string()), // absolute URL of the page the date was read from
    product_url: v.optional(v.string()),
    first_seen_at: v.string(),
  })
    .index("by_key", ["key"])
    .index("by_site", ["site"]),

  // A printing listed under a series page. Many-to-many, and the only place a
  // removal is recorded.
  printing_products: defineTable({
    key: v.string(), // {printing_key}@{product_key}
    printing_key: v.string(),
    product_key: v.string(),
    first_seen_at: v.string(),
    removed_at: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_printing", ["printing_key"])
    .index("by_product", ["product_key"]),

  distributions: defineTable({
    key: v.string(), // dist_xxxxxxxxxxxx
    region,
    kind: v.union(
      v.literal("promo_pack"),
      v.literal("tournament_prize"),
      v.literal("participation"),
      v.literal("event_pack"),
      v.literal("meetup"),
      v.literal("pre_release"),
      v.literal("magazine_insert"),
      v.literal("retail_tieup"),
      v.literal("bundle"),
      v.literal("movie"),
      v.literal("championship"),
      v.literal("store_tournament"),
      v.literal("online"),
      v.literal("other"),
    ),
    name: v.string(),
    name_native: v.optional(v.string()),
    starts_on: v.optional(v.string()),
    ends_on: v.optional(v.string()),
    tier: v.optional(
      v.union(
        v.literal("participant"),
        v.literal("winner"),
        v.literal("finalist"),
        v.literal("top_cut"),
        v.literal("judge"),
        v.literal("all"),
      ),
    ),
    quantity_note: v.optional(v.string()),
    source_url: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_region", ["region"]),

  // One claim, with its source and exact quote, that a printing came from a
  // distribution. Claims can disagree; all are kept and the UI ranks them.
  printing_distributions: defineTable({
    key: v.string(), // ev_ + 16 hex
    printing_key: v.string(),
    distribution_key: v.string(),
    source: v.union(
      v.literal("official_cardlist"),
      v.literal("official_event"),
      v.literal("official_topic"),
      v.literal("tcgcsv"),
      v.literal("namuwiki"),
      v.literal("manual"),
    ),
    source_url: v.string(),
    quote: v.string(),
    confidence,
    observed_at: v.string(),
  })
    .index("by_key", ["key"])
    .index("by_printing", ["printing_key"])
    .index("by_distribution", ["distribution_key"]),

  // Same art across sites. Matching work with review, never derived from ids.
  printing_links: defineTable({
    key: v.string(), // {printing_a}={printing_b}
    printing_a: v.string(),
    printing_b: v.string(),
    method: v.union(v.literal("manual"), v.literal("image_hash"), v.literal("number_and_distribution")),
    confidence,
    reviewed_by: v.optional(v.string()),
    reviewed_at: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_printing_a", ["printing_a"])
    .index("by_printing_b", ["printing_b"]),

  // App-only: which data-repo commit the tables above were synced from.
  data_syncs: defineTable({
    data_commit: v.string(),
    manifest_sha256: v.string(),
    started_at: v.string(),
    finished_at: v.optional(v.string()),
    status: v.union(v.literal("running"), v.literal("ok"), v.literal("refused"), v.literal("failed")),
    refusal: v.optional(v.string()), // e.g. "sha256 mismatch on data/printings/jp.jsonl"
    upserted: v.optional(v.number()),
  }).index("by_started_at", ["started_at"]),

  // App-only, derived: the set index. One row per product code across sites,
  // plus one per code-less bucket kind. Rebuilt by cardSets.rebuild after each
  // sync; card_count is the distinct cards listed under the set's products.
  card_sets: defineTable({
    slug: v.string(), // op-10, op14-eb04, promo
    code: v.optional(v.string()),
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
    card_count: v.number(),
    order: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"]),
});
