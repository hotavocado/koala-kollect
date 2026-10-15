import type { Metadata } from "next";
import { LOCALES, LOCALE_TAG, SITE_ORIGIN, localePath } from "@/lib/i18n/locales";

function urls(path: string): [string, string][] {
  return [
    ...LOCALES.map((l): [string, string] => [LOCALE_TAG[l], SITE_ORIGIN + localePath(l, path)]),
    ["x-default", SITE_ORIGIN + path],
  ];
}

// hreflang for a page whose path is known at build time, through metadata, so
// the links are in the prerendered <head>.
export function alternates(path: string): Metadata["alternates"] {
  return { languages: Object.fromEntries(urls(path)) };
}

// hreflang for a param route (card, print, set), rendered once params resolve.
// Under cacheComponents that is after the shell's <head> is flushed, so these
// land in the body, and so does generateMetadata's output (measured: only in
// the RSC payload). A Link header from proxy.ts is replaced by Next's own. A
// sitemap carrying the alternates is the follow-up that reaches crawlers.
export function Alternates({ path }: { path: string }) {
  return (
    <>
      {LOCALES.map((l) => (
        <link key={l} rel="alternate" hrefLang={LOCALE_TAG[l]} href={SITE_ORIGIN + localePath(l, path)} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={SITE_ORIGIN + path} />
    </>
  );
}
