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
  v.literal("jp"),
  v.literal("cn"),
);
// Where a printing, its locator or a card observation was read: an official
// site, or tcgcsv (TCGplayer's catalogue) for what no official site lists: DON
// cards, and the stamped Release Event prints of numbered cards. Products keep
// `site`.
export const printingSite = v.union(site, v.literal("tcgcsv"));
// A distribution's own site: an official site, or tcgcsv for a Release Event
// group. Its own enum, so tcgcsv never becomes a product site by the back door.
const distributionSite = v.union(site, v.literal("tcgcsv"));
const lang = v.union(v.literal("en"), v.literal("ja"), v.literal("zh-Hans"));
const region = v.union(v.literal("en"), v.literal("jp"), v.literal("cn"));
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

// The variants an official site lists.
const officialVariant = v.union(
  v.literal("base"),
  v.literal("parallel"),
  v.literal("alt_art"),
  v.literal("gold"), // gold DON!!, always foil
  v.literal("reprint"),
  v.literal("manga"),
  v.literal("serial"),
  v.literal("other"),
);
// tcgcsv adds TCGplayer's own: the Normal and Foil finishes of a DON!!, and a
// stamped Release Event print, which carries its base card's number and no
// other mark. The contract refuses all three on an official site.
const tcgcsvVariant = v.union(
  ...officialVariant.members,
  v.literal("normal"), // DON!! from tcgcsv: TCGplayer's Normal finish
  v.literal("foil"), // DON!! from tcgcsv: TCGplayer's Foil finish
  v.literal("stamped"), // Release Event stamped print from tcgcsv
);

// Every printings field but site, variant and image_url, which the table
// splits on.
const printingFields = {
  key: v.string(), // prt_xxxxxxxxxxxx
  card_key: v.string(),
  rarity: v.string(),
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
  // Perceptual hash of the printing's art region, written by the data repo's
  // hash job. Evidence for design matching only: never an identity.
  image_hash: v.optional(v.string()),
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
    // App-only, derived: what a browse row shows, so a set page, the browse
    // grid and search read the card alone. The data repo never sends it, the
    // sync carries it across a replace (syncCore DERIVED_FIELDS), and
    // cardSummary.chain recomputes it after every ok sync. Absent until then.
    summary: v.optional(
      v.object({
        name: v.union(v.string(), v.null()), // English first, as before names existed
        // The current printed name on each site that has one, so a browse row
        // can follow the reader's language. Absent on a summary stored before
        // it existed, until the chain next runs.
        names: v.optional(
          v.object({
            en: v.optional(v.string()),
            jp: v.optional(v.string()),
            cn: v.optional(v.string()),
            tcgcsv: v.optional(v.string()),
          }),
        ),
        printings: v.number(),
        image_url: v.union(v.string(), v.null()),
      }),
    ),
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
      v.object({ ...printingFields, site, variant: officialVariant, image_url: v.string() }), // official URL, linked, never re-hosted
      v.object({
        ...printingFields,
        site: v.literal("tcgcsv"),
        variant: tcgcsvVariant,
        image_url: v.optional(v.string()),
        // Where Bandai itself publishes this print's art (a product page or a
        // news post), when it does. Provenance only: the image stays image_url.
        provenance_url: v.optional(v.string()),
      }),
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
    key: v.string(), // {site}:{series_id}, or {site}:src_{hash} for a product named only in source text
    site,
    series_id: v.optional(v.string()), // absent on a product minted from source text
    // True on a site-wide catch-all series (promo or other product cards) that
    // stands in for the real products; absent everywhere else.
    is_bucket: v.optional(v.boolean()),
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
  // from one site's card list, so the same pack name on en and jp is two
  // distributions; a Release Event group is minted from tcgcsv. When, which
  // tier and how many are on each printing_distributions claim.
  distributions: defineTable({
    key: v.string(), // dist_xxxxxxxxxxxx
    site: distributionSite,
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
    // The stamp colour of the prize pack, set at review off the competition
    // page that names it (gold, black, ...). A design's stamp colour is read
    // through its printings' distributions, never stored on the design.
    stamp_color: v.optional(v.union(v.string(), v.null())),
    stamp_color_source: v.optional(v.union(v.string(), v.null())), // that competition page's URL, or the literal "reviewed"
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

  // A design is one art of a card: the same art, stamp and stamp colour in any
  // language. Minted and reviewed in the data repo, never derived from ids.
  // Its printings join through printing_designs at read time.
  designs: defineTable({
    key: v.string(), // dsn_xxxxxxxxxxxx
    card_key: v.string(),
    stamp: v.optional(v.union(v.string(), v.null())), // the stamp text verbatim
    // Set at review where the exclusive rule reads wrong (a release lag).
    exclusive_override: v.optional(v.union(v.boolean(), v.null())),
    reviewed_by: v.optional(v.string()),
    reviewed_at: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_card", ["card_key"]),

  // Which design a printing is. At most one row per printing; a printing with
  // none is unreviewed and stays out of design counts and the exclusive test.
  printing_designs: defineTable({
    key: v.string(), // the printing's key
    printing_key: v.string(),
    design_key: v.string(),
    method: v.union(v.literal("manual"), v.literal("image_hash"), v.literal("suffix_and_rarity")),
    // Optional: the data contract's printing_design carries no confidence, since
    // method already says how the membership was decided. Required, it refused
    // the contract's own reviewed example row (koala-kollect-data #26).
    confidence: v.optional(confidence),
    reviewed_by: v.optional(v.string()),
    reviewed_at: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_printing", ["printing_key"])
    .index("by_design", ["design_key"]),

  // One set across every language it was printed in (OP-09 is OPC-09 in cn).
  // A set's instance in one language is its products on that site, and its
  // title in a language is read off those products.
  // Uncoded promo and event packs share one set keyed P.
  sets: defineTable({
    key: v.string(), // equal to code
    code: v.string(), // the code in its global form: OP-09, EB-04, PRB-02, P
  }).index("by_key", ["key"]),

  // Products to sets, many to many: en OP14-EB04 holds cards of two sets.
  product_sets: defineTable({
    key: v.string(), // {product_key}@{set_key}
    product_key: v.string(),
    set_key: v.string(),
  })
    .index("by_key", ["key"])
    .index("by_product", ["product_key"])
    .index("by_set", ["set_key"]),

  // Which set page a DON card belongs on. DON carry no set in their number, so
  // the data repo maps each one: by its TCGplayer group, by an override when
  // the product names another set, or to the promo page.
  don_sets: defineTable({
    key: v.string(), // the card's key, card_xxxxxxxxxxxx
    printing_keys: v.array(v.string()), // the card's tcgcsv printings, sorted
    don_design: v.string(),
    set_slug: v.string(), // the en product code lowercased, or "promo"
    source: v.union(v.literal("group"), v.literal("override"), v.literal("promo")),
    first_seen_at: v.string(),
  })
    .index("by_key", ["key"])
    .index("by_set_slug", ["set_slug"]),

  // App-only: which data-repo commit the tables above were synced from.
  data_syncs: defineTable({
    data_commit: v.string(),
    manifest_sha256: v.string(),
    started_at: v.string(),
    finished_at: v.optional(v.string()),
    status: v.union(v.literal("running"), v.literal("ok"), v.literal("refused"), v.literal("failed")),
    refusal: v.optional(v.string()), // e.g. "sha256 mismatch on data/printings/jp.jsonl"
    upserted: v.optional(v.number()),
    retired: v.optional(v.number()), // printings deleted by data/retired_printings.jsonl
    // On an ok sync: printings in the commit whose image the proxy refuses
    // (they show the text face), and when non-zero their count per site and
    // the first 50 of their keys.
    unproxied_images: v.optional(v.number()),
    unproxied_image_keys: v.optional(v.array(v.string())),
    unproxied_image_sites: v.optional(v.array(v.object({ site: printingSite, count: v.number() }))),
    // Set by cardSummary.chain once it has recomputed every card after this
    // sync: when it finished and how many cards' summaries changed.
    summarized_at: v.optional(v.string()),
    summarized_cards: v.optional(v.number()),
  }).index("by_started_at", ["started_at"]),

  // App-only, derived: the set index. One row per set (product_sets) across
  // sites, one per code of a product with no set, plus one per code-less
  // bucket kind. Rebuilt by cardSets.rebuild after each
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
    // The title in each language the set has a product in; title is the
    // English-first one. Absent on a row rebuilt before it existed.
    titles: v.optional(
      v.object({ en: v.optional(v.string()), jp: v.optional(v.string()), cn: v.optional(v.string()) }),
    ),
    product_keys: v.array(v.string()),
    // Old product-code slugs this set's page replaced (opc-09, op14-eb04), so
    // the DON don_sets places on them still show here.
    aliases: v.optional(v.array(v.string())),
    // Products that also carry another set: their cards numbered for that set
    // are left off this page and its count.
    shared: v.optional(v.array(v.object({ product_key: v.string(), other_sets: v.array(v.string()) }))),
    release_date: v.optional(v.string()), // en's, or jp's when en has no dated product for the code
    release_site: v.optional(v.union(v.literal("en"), v.literal("jp"))),
    card_count: v.number(),
    order: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"]),
});
