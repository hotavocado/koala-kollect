import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALES, LOCALE_TAG, SITE_ORIGIN, type Locale, isLocale, localePath } from "./i18n/locales";

// The sitemap's pure half: site paths in, sitemap entries out. app/sitemap.ts
// gathers the paths from Convex; the in-page hreflang (app/[lang]/_site/
// alternates.tsx) reads the same alternates, so the two never disagree.

// Each language's sitemap is split into this many shards by card, so one
// shard's response stays well under Vercel's ~4.5 MB function response cap.
export const SITEMAP_BUCKETS = 8;

// A shard past this many URLs (about 3.3 MB at ~800 bytes a URL with its six
// alternates) is getting close to that cap.
export const SHARD_URL_WARN = 4_000;

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

// One shard's entries: each path's URL in that locale, with its alternates.
export function sitemapEntries(lang: Locale, paths: readonly string[]): MetadataRoute.Sitemap {
  return paths.map((path) => ({ url: SITE_ORIGIN + localePath(lang, path), alternates: languageAlternates(path) }));
}

// The bucket a card's pages go in: 32-bit FNV-1a of the key, so it depends on
// the key alone and a card and its prints always share a shard. FNV-1a's low
// bits depend only on the characters' low bits, so murmur3's finalizer mixes
// the high bits down before the modulo.
export function bucketOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % SITEMAP_BUCKETS;
}

export type SitemapShard = { lang: Locale; bucket: number };

// A shard's public path. Next serves generateSitemaps output at
// /sitemap/<id>.xml, but a sitemap only vouches for URLs under its own
// directory, so next.config.ts rewrites this root-level path onto it and
// robots.txt advertises this one.
export function sitemapPath(id: string): string {
  return `/sitemap-${id}.xml`;
}

// Every shard id, "<lang>-<bucket>".
export function sitemapIds(): string[] {
  return LOCALES.flatMap((l) => Array.from({ length: SITEMAP_BUCKETS }, (_, b) => `${l}-${b}`));
}

export function parseSitemapId(id: string): SitemapShard | null {
  const m = /^([a-z]+)-(\d+)$/.exec(id);
  if (!m || !isLocale(m[1])) return null;
  const bucket = Number(m[2]);
  return String(bucket) === m[2] && bucket < SITEMAP_BUCKETS ? { lang: m[1], bucket } : null;
}

// One bucket's pages: bucket 0 also holds home, the set index and each set;
// every bucket holds its cards and each of their prints.
export function sitePaths(
  bucket: number,
  sets: readonly string[],
  cards: readonly { key: string; prints: readonly string[] }[],
): string[] {
  return [
    ...(bucket === 0 ? ["/", "/cards", ...sets.map((slug) => `/cards/set/${slug}`)] : []),
    ...cards
      .filter((c) => bucketOf(c.key) === bucket)
      .flatMap((c) => [`/cards/${c.key}`, ...c.prints.map((p) => `/cards/${c.key}/${p}`)]),
  ];
}

// The warning for a shard grown past SHARD_URL_WARN, or null.
export function shardWarning(id: string, urls: number): string | null {
  if (urls <= SHARD_URL_WARN) return null;
  return (
    `SITEMAP SHARD TOO BIG: ${sitemapPath(id)} lists ${urls} URLs, over ${SHARD_URL_WARN} ` +
    `(about 3.3 MB, near Vercel's 4.5 MB response cap): raise the bucket count, SITEMAP_BUCKETS in lib/sitemap.ts.`
  );
}
