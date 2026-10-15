import type { MetadataRoute } from "next";
import { LOCALES, SITE_ORIGIN } from "@/lib/i18n/locales";

// Crawl everything, and here are the five language sitemaps, at the paths
// app/sitemap.ts's generateSitemaps serves them (measured on next start).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: LOCALES.map((l) => `${SITE_ORIGIN}/sitemap/${l}.xml`),
  };
}
