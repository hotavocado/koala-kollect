import type { Metadata } from "next";
import { languageAlternates } from "@/lib/sitemap";

// hreflang for a page whose path is known at build time, through metadata, so
// the links are in the prerendered <head>.
export function alternates(path: string): Metadata["alternates"] {
  return languageAlternates(path);
}

// hreflang for a param route (card, print, set), rendered once params resolve.
// Under cacheComponents that is after the shell's <head> is flushed, so these
// land in the body, and so does generateMetadata's output (measured: only in
// the RSC payload). A Link header from proxy.ts is replaced by Next's own. The
// sitemap (app/sitemap.ts) carries the same alternates where crawlers read them.
export function Alternates({ path }: { path: string }) {
  return (
    <>
      {Object.entries(languageAlternates(path).languages).map(([tag, href]) => (
        <link key={tag} rel="alternate" hrefLang={tag} href={href} />
      ))}
    </>
  );
}
