import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/i18n/locales";
import { sitemapIds } from "@/lib/sitemap";

// Crawl everything, and here are the forty sitemaps (eight per language), at
// the paths app/sitemap.ts's generateSitemaps serves them (measured on next
// start).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: sitemapIds().map((id) => `${SITE_ORIGIN}/sitemap/${id}.xml`),
  };
}
