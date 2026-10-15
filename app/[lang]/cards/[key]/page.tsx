import type { Metadata } from "next";
import { Suspense } from "react";
import { getI18n } from "@/lib/i18n";
import { CardDetailView } from "./card-detail";
import { Alternates } from "../../_site/alternates";
import { SiteHeader } from "../../_site/site-header";
import { ImageCredit } from "../../_site/image-credit";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.cardTitle, description: t.meta.cardDescription };
}

// The header is static. The key is request data under cacheComponents (there
// is no generateStaticParams: the card list lives in Convex, not the build),
// so reading it sits inside a Suspense boundary.
export default async function CardPage({ params }: { params: Promise<{ key: string }> }) {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader back="cards" />
      <main className="container flex-1 pb-12 pt-4">
        <Suspense fallback={<p className="text-sm text-muted-foreground">{t.cards.loadingCard}</p>}>
          {params.then(({ key }) => (
            <>
              <Alternates path={`/cards/${key}`} />
              <CardDetailView cardKey={key} />
            </>
          ))}
        </Suspense>
      </main>
      <ImageCredit />
    </div>
  );
}
