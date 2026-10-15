import type { MetadataRoute } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cacheLife } from "next/cache";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { SitemapCard } from "@/convex/sitemap";
import { parseSitemapId, shardWarning, sitemapEntries, sitemapIds, sitePaths } from "@/lib/sitemap";

// The sitemaps, eight per language, served at /sitemap/<lang>-<bucket>.xml and
// published at /sitemap-<lang>-<bucket>.xml (see sitemapPath in lib/sitemap.ts).
// Each lists its bucket's pages in that language with hreflang alternates to
// the other four: the param routes (card, print, set) can't carry them in a
// crawler-visible <head> under cacheComponents (see app/[lang]/_site/
// alternates.tsx), so this is where crawlers find them.
export async function generateSitemaps() {
  return sitemapIds().map((id) => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  // Request time only, never at build: a build must not need Convex reachable,
  // nor a query the deployment may not have yet (the Vercel build and the
  // Convex deploy run side by side on merge).
  await connection();
  const shardId = await id;
  const shard = parseSitemapId(shardId);
  if (!shard) notFound();
  const { sets, cards } = await siteData();
  const paths = sitePaths(shard.bucket, sets, cards);
  // Listed in full all the same, so an overgrown shard shows here rather than
  // as pages silently left out.
  const warning = shardWarning(shardId, paths.length);
  if (warning) console.error(warning);
  return sitemapEntries(shard.lang, paths);
}

// Every set slug and card (with its prints), read from Convex. The card data
// changes at most once a day (the sync), so it is cached for a day, in the
// remote cache: the sitemaps render at request time, and the in-memory one
// is per serverless instance, so it would walk Convex on most requests (Next
// docs, use-cache-remote.md). Without a remote handler (next start) Next falls
// back to the in-memory one. It takes no arguments, so one entry serves all
// forty shards.
async function siteData(): Promise<{ sets: string[]; cards: SitemapCard[] }> {
  "use cache: remote";
  cacheLife("days");
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set: the sitemap reads its pages from Convex.");
  const client = new ConvexHttpClient(url);
  const [sets, cards] = await Promise.all([client.query(api.cards.sets, {}), allCards(client)]);
  return { sets: sets.map((s) => s.slug), cards };
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
