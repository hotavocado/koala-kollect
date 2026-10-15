// The site's languages. The URL carries the locale as its first segment
// (/ja/cards), except English, which is served bare (/cards) by a rewrite in
// proxy.ts. Kept free of server and client imports so proxy.ts can use it.

export const LOCALES = ["en", "ja", "zh", "ko", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

// The site's origin. hreflang links must be absolute, and metadataBase only
// resolves the URLs Next writes itself.
export const SITE_ORIGIN = "https://koalakollect.app";

// The cookie the toggle's choice lives in. proxy.ts writes it whenever a
// locale-prefixed URL is visited, and reads it on a bare one.
export const LOCALE_COOKIE = "lang";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

// The BCP 47 tag for html lang, hreflang and Intl. zh is Simplified Chinese.
export const LOCALE_TAG: Record<Locale, string> = { en: "en", ja: "ja", zh: "zh-Hans", ko: "ko", fr: "fr" };

// Each language named in itself, as the toggle lists them.
export const NATIVE_NAME: Record<Locale, string> = {
  en: "English",
  ja: "日本語",
  zh: "简体中文",
  ko: "한국어",
  fr: "Français",
};

// A site path ("/cards/x") as a link in `lang`. English is bare.
export function localePath(lang: Locale, path: string): string {
  if (lang === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${lang}` : `/${lang}${path}`;
}

// The language toggle's link to this page in `lang`: always /<lang>/<path>,
// English included, so the proxy records the choice (and spells English
// bare). The query string rides along, so switching language keeps a search.
export function switchPath(lang: Locale, path: string, search: string): string {
  const query = search && !search.startsWith("?") ? `?${search}` : search;
  return `/${lang}${path === "/" ? "" : path}${query}`;
}

// Splits a pathname into its locale prefix, if any, and the site path.
export function splitLocale(pathname: string): { lang: Locale | null; path: string } {
  const first = pathname.split("/")[1] ?? "";
  if (!isLocale(first)) return { lang: null, path: pathname || "/" };
  return { lang: first, path: pathname.slice(first.length + 1) || "/" };
}

// The best supported locale for an Accept-Language header, or null. Matches
// on the primary subtag, so zh-CN, zh-TW and zh-Hant all read as zh: the site
// carries Simplified Chinese only.
export function negotiate(header: string | null): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) : 1, i };
    })
    .filter((r) => r.tag && Number.isFinite(r.q) && r.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { tag } of ranked) {
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return null;
}
