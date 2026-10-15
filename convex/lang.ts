import { v, type Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";

// The site's languages as the card queries take them. The same five as
// lib/i18n/locales.ts, declared here so the Convex bundle needs nothing from
// lib; a client passing its useI18n() lang fails tsc if the two drift.
export const locale = v.union(v.literal("en"), v.literal("ja"), v.literal("zh"), v.literal("ko"), v.literal("fr"));
export type Locale = Infer<typeof locale>;

type Site = Doc<"card_observations">["site"];

// Whose card text to show, by the reader's language: their own site first,
// then English, then the card's own. JP before cn because JP is the authority
// for card facts. tcgcsv last: it observes DON cards only, which no official
// site lists, so it never outranks one. ko and fr have no card list of their
// own, so they read as English.
export const SITE_ORDER: Record<Locale, readonly Site[]> = {
  en: ["en", "jp", "cn", "tcgcsv"],
  ja: ["jp", "en", "cn", "tcgcsv"],
  zh: ["cn", "en", "jp", "tcgcsv"],
  ko: ["en", "jp", "cn", "tcgcsv"],
  fr: ["en", "jp", "cn", "tcgcsv"],
};

// The language a site's text is written in. tcgcsv is TCGplayer's English catalogue.
export const SITE_LOCALE: Record<Site, Locale> = { en: "en", jp: "ja", cn: "zh", tcgcsv: "en" };
