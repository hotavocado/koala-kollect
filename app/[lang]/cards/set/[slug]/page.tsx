import type { Metadata } from "next";
import { Suspense } from "react";
import { getI18n } from "@/lib/i18n";
import { SetCardsView } from "./set-cards";
import { Alternates } from "../../../_site/alternates";
import { SiteHeader } from "../../../_site/site-header";
import { ImageCredit } from "../../../_site/image-credit";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.setTitle, description: t.meta.setDescription };
}

// Same shape as the card page: a static header, and the slug read inside a
// Suspense boundary because it is request data under cacheComponents.
export default async function SetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader back="sets" />
      <main className="container flex-1 pb-12 pt-4">
        <Suspense fallback={<p className="text-sm text-muted-foreground">{t.cards.loadingSet}</p>}>
          {params.then(({ slug }) => (
            <>
              <Alternates path={`/cards/set/${slug}`} />
              <SetCardsView slug={slug} />
            </>
          ))}
        </Suspense>
      </main>
      <ImageCredit />
    </div>
  );
}
