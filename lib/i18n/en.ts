import type { Doc } from "@/convex/_generated/dataModel";
import type { CardClaim, CardPrinting, CardRegion } from "@/convex/cards";
import type { Plural } from "./format";

// The site's own text in English. This file defines the dictionary's shape:
// every other language is checked against it, so a key missing there, or one
// it adds, fails the build. Card data (names, effects, set titles) is not here;
// it comes from each language's own card list.

const plural = (forms: Plural): Plural => forms;

type Distribution = NonNullable<CardClaim["distribution"]>;

const en = {
  // A draft has not had a native read yet; its pages say so.
  draft: false,
  site: {
    name: "Koala Kollect",
    cards: "Cards",
    sets: "Sets",
    language: "Language",
    draftNotice: "",
    imageCredit:
      "Card images © Eiichiro Oda/Shueisha, Toei Animation, from the official ONE PIECE CARD GAME card lists and from TCGplayer. Koala Kollect is an unofficial fan project.",
    opensInNewTab: "(opens in a new tab)",
    notConnectedTitle: "The card database isn't connected",
    notConnectedBody: "This build has no Convex deployment configured.",
  },
  meta: {
    homeTitle: "Koala Kollect",
    homeDescription: "Every One Piece Card Game card, and where each printing came from.",
    cardsTitle: "Cards · Koala Kollect",
    cardsDescription:
      "Find any One Piece Card Game card by number or name, or browse every set, starter deck and promotion in the Koala Kollect database.",
    cardTitle: "Card · Koala Kollect",
    cardDescription: "A One Piece Card Game card, every printing of it, and where each one came from.",
    printTitle: "Printing · Koala Kollect",
    printDescription: "One printing of a One Piece Card Game card: its own image and where it came from.",
    setTitle: "Set · Koala Kollect",
    setDescription: "Every card in one One Piece Card Game set, in card-number order.",
  },
  home: {
    headline: "Digital home for your One Piece TCG collection",
    browse: "Browse the cards",
    tagline: "Free and open source. Built and maintained by the OP TCG community",
    artAlt: "Minokoala, from the One Piece anime's concept art",
    disclaimer: "Fan-made and not affiliated with Bandai. Card images link to their official sources.",
    source: "Source on GitHub",
  },
  cards: {
    heading: "Cards",
    loadingCard: "Loading card…",
    loadingPrinting: "Loading printing…",
    loadingSet: "Loading set…",
  },
  count: {
    cards: plural({ one: "{n} card", other: "{n} cards" }),
    printings: plural({ one: "{n} printing", other: "{n} printings" }),
    sources: plural({ one: "{n} source", other: "{n} sources" }),
  },
  finder: {
    label: "Find a card by number or name",
    placeholder: "Card number or name, e.g. OP01-001 or Nami",
    searching: "Searching…",
    noMatch: "No card matches “{term}”. Try a card number like OP01-001 or P-034, or part of a name.",
    results: "Search results",
    showingFirst: "Showing the first {n}. Type more of the number or name to narrow it.",
  },
  setIndex: {
    loading: "Loading sets…",
    order:
      "Newest release first in each group, by the English release date. A set with no English release shows its Japanese date, marked JP.",
    emptyTitle: "No sets yet",
    emptyBody: "The database fills from the official card lists once the first one is published.",
    noSync: "No sync has run yet.",
    syncedOk: "Last synced {when}.",
    syncRunning: "A sync started {when} and is still running.",
    syncNothing: "Last checked {when}, and no card list was ready to load.",
  },
  set: {
    notFoundTitle: "Set not found",
    notFoundBody: "There is no set at this address in the database.",
    fromOtherSets: "From other sets",
    fromOtherSetsBody: "Cards first printed elsewhere that this set also includes, such as SP cards and reprints.",
    don: "DON!! cards",
    donBody: "DON!! cards that come with this set. They have no card number, so they sit apart from the list above.",
  },
  card: {
    unnamed: "Unnamed card",
    notFoundTitle: "Card not found",
    notFoundBody: "There is no card with this link in the database.",
    browse: "Browse the cards",
    officialPage: "See the card on the official card list",
    cnOnly:
      "Listed only on the Simplified Chinese card list, so its name and text are in Chinese, and there is no official page to link to.",
    donSource:
      "No official card list carries DON!! cards, so this one comes from TCGplayer's catalogue. The name is TCGplayer's, and each printing's page links to its TCGplayer listing.",
    trigger: "Trigger",
    textFromTcgplayer: "Name from TCGplayer's catalogue.",
    textFrom: "Text from the {site} card list.",
    noPrintings: "No printings of this card are listed yet.",
    onSiteList: "On this site's card list",
    fromTcgplayer: "from TCGplayer",
    noSourceTcgplayer: "TCGplayer lists no source for this printing.",
    noSourceList: "The card list prints no source for this printing.",
    from: "From {origins}",
    whereFrom: "Where it came from",
  },
  print: {
    notFoundTitle: "Printing not found",
    notFoundBody: "There is no printing with this link in the database.",
    backToCard: "Back to the card",
    allPrintings: "All printings of {name}",
    tcgplayerListing: "TCGplayer listing",
    onSiteList: "On the {site} card list",
    price: "Price",
    priceNotLive: "Price tracking for this printing isn't live yet.",
    listedUnder: "Listed under",
    whereFrom: "Where it came from",
    noOrigin: "No source for this printing's origin is recorded yet.",
  },
  listing: {
    series: "Series {id}",
    noLongerListed: "no longer listed",
  },
  claim: {
    unknownSource: "A source not yet in the database",
    range: "{from} to {to}",
    until: "Until {date}",
  },
  // A release date taken from the Japanese site, where there is no English one.
  jpDate: "JP {date}",
  stat: { cost: "Cost", life: "Life", power: "Power", counter: "Counter" },
  color: {
    red: "Red",
    green: "Green",
    blue: "Blue",
    purple: "Purple",
    black: "Black",
    yellow: "Yellow",
  } satisfies Record<Doc<"cards">["colors"][number], string>,
  category: {
    leader: "Leader",
    character: "Character",
    event: "Event",
    stage: "Stage",
    don: "DON!!",
  } satisfies Record<Doc<"cards">["category"], string>,
  attribute: {
    slash: "Slash",
    strike: "Strike",
    ranged: "Ranged",
    special: "Special",
    wisdom: "Wisdom",
    "?": "?",
  } satisfies Record<Doc<"cards">["attributes"][number], string>,
  setKindHeading: {
    booster: "Booster packs",
    extra: "Extra boosters",
    premium: "Premium boosters",
    starter: "Starter decks",
    promo: "Promotions",
    limited: "Limited products",
    family: "Family decks",
    other: "Other",
  } satisfies Record<Doc<"card_sets">["kind"], string>,
  setKind: {
    booster: "Booster pack",
    extra: "Extra booster",
    premium: "Premium booster",
    starter: "Starter deck",
    promo: "Promotion",
    limited: "Limited product",
    family: "Family deck",
    other: "Other",
  } satisfies Record<Doc<"card_sets">["kind"], string>,
  // Keyed by language: TCGplayer's printings sit under English, never a
  // heading of their own.
  siteLanguage: {
    en: "English",
    jp: "Japanese",
    cn: "Simplified Chinese",
  } satisfies Record<CardRegion["language"], string>,
  variant: {
    base: "Base",
    normal: "Normal",
    foil: "Foil",
    parallel: "Parallel",
    alt_art: "Alt art",
    gold: "Gold",
    reprint: "Reprint",
    manga: "Manga",
    serial: "Serial",
    stamped: "Stamped",
    other: "Other",
  } satisfies Record<CardPrinting["variant"], string>,
  source: {
    official_cardlist: "Official card list",
    official_event: "Official event page",
    official_topic: "Official news",
    tcgcsv: "TCGplayer",
    namuwiki: "Namuwiki",
    manual: "Added by hand",
  } satisfies Record<CardClaim["source"], string>,
  // An official claim's source link already says so, so it carries no label.
  confidence: {
    authoritative: null,
    corroborated: "Corroborated",
    inferred: "Inferred, not yet confirmed",
  } satisfies Record<CardClaim["confidence"], string | null>,
  distributionKind: {
    promo_pack: "Promo pack",
    tournament_prize: "Tournament prize",
    participation: "Participation prize",
    event_pack: "Event pack",
    meetup: "Meetup",
    pre_release: "Pre-release",
    magazine_insert: "Magazine insert",
    retail_tieup: "Retail tie-in",
    bundle: "Bundle",
    movie: "Movie handout",
    championship: "Championship",
    store_tournament: "Store tournament",
    online: "Online",
    other: "Other",
  } satisfies Record<Distribution["kind"], string>,
  region: {
    en: "English region",
    jp: "Japan",
    cn: "China",
  } satisfies Record<Distribution["region"], string>,
  tier: {
    participant: "For participants",
    winner: "For winners",
    finalist: "For finalists",
    top_cut: "For the top cut",
    judge: "For judges",
    all: "For everyone",
  } satisfies Record<NonNullable<CardClaim["tier"]>, string>,
};

export type Dict = typeof en;
export default en;
