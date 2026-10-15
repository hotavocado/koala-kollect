import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/i18n/locales";
import { sitemapIds, sitemapPath } from "@/lib/sitemap";

// Crawl everything, and here are the forty sitemaps (eight per language), at
// their root-level paths (next.config.ts rewrites them onto app/sitemap.ts).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: sitemapIds().map((id) => `${SITE_ORIGIN}${sitemapPath(id)}`),
  };
}
