import type { MetadataRoute } from "next";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { SitemapCard } from "@/convex/sitemap";
import { LOCALES, isLocale } from "@/lib/i18n/locales";
import { SITEMAP_URL_LIMIT, sitemapEntries, sitePaths } from "@/lib/sitemap";

// One sitemap per language, served at /sitemap/<lang>.xml. Each lists every
// page in that language with hreflang alternates to the other four: the param
// routes (card, print, set) can't carry them in a crawler-visible <head> under
// cacheComponents (see app/[lang]/_site/alternates.tsx), so this is where
// crawlers find them.
export async function generateSitemaps() {
  return LOCALES.map((id) => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const lang = await id;
  if (!isLocale(lang)) notFound();
  const paths = await allPaths();
  if (paths.length > SITEMAP_URL_LIMIT) {
    // Google ignores what is past the limit. Listed in full all the same, so
    // the overflow shows here rather than as pages silently left out.
    console.error(
      `SITEMAP OVER LIMIT: /sitemap/${lang}.xml lists ${paths.length} URLs, over the ${SITEMAP_URL_LIMIT} a sitemap may hold. Split the shards.`,
    );
  }
  return sitemapEntries(lang, paths);
}

// Every site path, read from Convex. The card data changes at most once a day
// (the sync), so the list is cached for a day: under cacheComponents the
// sitemap is then prerendered at build and revalidated daily (measured: the
// prerender manifest carries revalidate 86400 per shard). It takes no
// arguments, so one cache entry serves all five shards.
async function allPaths(): Promise<string[]> {
  "use cache";
  cacheLife("days");
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set: the sitemap reads its pages from Convex.");
  const client = new ConvexHttpClient(url);

  const [sets, cards] = await Promise.all([client.query(api.cards.sets, {}), allCards(client)]);
  return sitePaths(
    sets.map((s) => s.slug),
    cards,
  );
}

async function allCards(client: ConvexHttpClient): Promise<SitemapCard[]> {
  const cards: SitemapCard[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: { page: SitemapCard[]; isDone: boolean; continueCursor: string } = await client.query(
      api.sitemap.cards,
      { paginationOpts: { numItems: 100, cursor } },
    );
    cards.push(...page.page);
    if (page.isDone) return cards;
    cursor = page.continueCursor;
  }
}
