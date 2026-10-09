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
// Where a printing, its locator or a card observation was read: an official
// site, or tcgcsv for DON cards (no official site lists DON). The contract
// refuses tcgcsv on anything but a DON card; products keep `site`.
export const printingSite = v.union(site, v.literal("tcgcsv"));
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
// block_icon is not one of them: it is a printing fact, and card.block_icon is
// derived from the printings (koala-kollect-data CONTRACT.md).
const cardFacts = {
  category,
  colors: v.array(color),
  cost: v.optional(v.number()),
  life: v.optional(v.number()),
  power: v.optional(v.number()),
  counter: v.optional(v.number()),
  attributes: v.array(attribute),
};

// Every printings field but site and image_url, which the table splits on.
const printingFields = {
  key: v.string(), // prt_xxxxxxxxxxxx
  card_key: v.string(),
  rarity: v.string(),
  variant: v.union(
    v.literal("base"),
    v.literal("parallel"),
    v.literal("alt_art"),
    v.literal("normal"), // DON!! from tcgcsv: TCGplayer's Normal finish
    v.literal("foil"), // DON!! from tcgcsv: TCGplayer's Foil finish
    v.literal("gold"), // gold DON!!, always foil
    v.literal("reprint"),
    v.literal("manga"),
    v.literal("serial"),
    v.literal("other"),
  ),
  source_text: v.string(), // the verbatim provenance string
  // As printed on this printing on this site: a number, "X" (never rotates
  // out of standard), or null where the site prints none. Required.
  block_icon: v.union(v.number(), v.literal("X"), v.null()),
  // cn only, verbatim, absent when cn writes none: the token cn appends to
  // the card number (P-084_01 -> "_01") and the one its image file name
  // carries (OP06-050P.png -> "P"). Evidence for variant, never part of the
  // card's number. cn's variant is base or parallel only (the contract
  // refuses reprint there).
  number_token: v.optional(v.string()),
  image_token: v.optional(v.string()),
  first_seen_at: v.string(),
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
    // Derived by the data repo from the facts site's printings; never "X".
    block_icon: v.optional(v.number()),
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
    // tcgcsv on DON cards only, carrying TCGplayer's product name as the name.
    site: printingSite,
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
    .index("by_card_site", ["card_key", "site"])
    // Card search by name, in every language a site prints. An index, not a
    // field: nothing the sync writes changes.
    .searchIndex("search_name", { searchField: "name" }),

  // One physical print as one site lists it. No removed_at: where it is listed
  // lives on printing_products, and printings move between series pages under
  // the same image id.
  //
  // image_url is required on every official site and optional on tcgcsv only:
  // TCGplayer lists a new DON at imageCount 0 for a while, so the data repo
  // omits the URL until an image exists and the daily run writes it then.
  printings: defineTable(
    v.union(
      v.object({ ...printingFields, site, image_url: v.string() }), // official URL, linked, never re-hosted
      v.object({ ...printingFields, site: v.literal("tcgcsv"), image_url: v.optional(v.string()) }),
    ),
  )
    .index("by_key", ["key"])
    .index("by_card", ["card_key"])
    .index("by_site", ["site"]),

  // site:image_id -> printing. Measured stable per site, so one row per printing
  // in practice; a future renumber would be a new row here, not a new printing.
  printing_locators: defineTable({
    key: v.string(), // {site}:{image_id}
    printing_key: v.string(),
    site: printingSite,
    image_id: v.string(), // OP14-108_p3, P-001_p5, ..._r1; cn: numeric; tcgcsv: 512344:Normal
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
    release_date: v.optional(v.string()), // YYYY-MM-DD; omitted on the limited and promo buckets
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

  // The pack or handout itself: what it is and in which region. It is minted
  // from one site's card list, so the same pack name on en and asia-en is two
  // distributions. When, which tier and how many are on each
  // printing_distributions claim.
  distributions: defineTable({
    key: v.string(), // dist_xxxxxxxxxxxx
    site,
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
    // What this source page says about the handout. They live on the claim,
    // not the distribution, because two pages can disagree on them.
    // Dates may be YYYY or YYYY-MM.
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
    // On an ok sync: printings in the commit whose image the proxy refuses
    // (they show the text face), and when non-zero their count per site and
    // the first 50 of their keys.
    unproxied_images: v.optional(v.number()),
    unproxied_image_keys: v.optional(v.array(v.string())),
    unproxied_image_sites: v.optional(v.array(v.object({ site: printingSite, count: v.number() }))),
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
    release_date: v.optional(v.string()), // en's, or jp's when en has no dated product for the code
    release_site: v.optional(v.union(v.literal("en"), v.literal("jp"))),
    card_count: v.number(),
    order: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"]),
});
