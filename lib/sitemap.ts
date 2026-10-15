import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALES, LOCALE_TAG, SITE_ORIGIN, type Locale, localePath } from "./i18n/locales";

// The sitemap's pure half: site paths in, sitemap entries out. app/sitemap.ts
// gathers the paths from Convex; the in-page hreflang (app/[lang]/_site/
// alternates.tsx) reads the same alternates, so the two never disagree.

// Google reads at most this many URLs from one sitemap file.
export const SITEMAP_URL_LIMIT = 50_000;

export type LanguageAlternates = { languages: Record<string, string> };

// hreflang for one site path ("/", "/cards", "/cards/x"): every locale's
// absolute URL under its BCP 47 tag, and x-default on the bare English URL.
export function languageAlternates(path: string): LanguageAlternates {
  return {
    languages: Object.fromEntries([
      ...LOCALES.map((l) => [LOCALE_TAG[l], SITE_ORIGIN + localePath(l, path)]),
      ["x-default", SITE_ORIGIN + localePath(DEFAULT_LOCALE, path)],
    ]),
  };
}

// One locale's sitemap: each path's URL in that locale, with its alternates.
export function sitemapEntries(lang: Locale, paths: readonly string[]): MetadataRoute.Sitemap {
  return paths.map((path) => ({ url: SITE_ORIGIN + localePath(lang, path), alternates: languageAlternates(path) }));
}

// Every page a crawler should find: home, the set index, each set, each card
// and each of its prints.
export function sitePaths(sets: readonly string[], cards: readonly { key: string; prints: readonly string[] }[]): string[] {
  return [
    "/",
    "/cards",
    ...sets.map((slug) => `/cards/set/${slug}`),
    ...cards.flatMap((c) => [`/cards/${c.key}`, ...c.prints.map((p) => `/cards/${c.key}/${p}`)]),
  ];
}
