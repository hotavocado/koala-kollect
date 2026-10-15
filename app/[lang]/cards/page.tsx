import type { Metadata } from "next";
import { Suspense } from "react";
import { getI18n } from "@/lib/i18n";
import { alternates } from "../_site/alternates";
import { SiteHeader } from "../_site/site-header";
import { CardFinder } from "./card-finder";
import { ImageCredit } from "../_site/image-credit";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.cardsTitle, description: t.meta.cardsDescription, alternates: alternates("/cards") };
}

export default async function CardsPage() {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container flex-1 pb-12 pt-4">
        <h1 className="text-3xl font-semibold">{t.cards.heading}</h1>
        <div className="mt-6">
          {/* CardFinder reads ?q=, so it renders on the client; the box holds its place meanwhile. */}
          <Suspense fallback={<div className="h-12 rounded-lg border border-input bg-layer-1" />}>
            <CardFinder />
          </Suspense>
        </div>
      </main>
      <ImageCredit />
    </div>
  );
}
