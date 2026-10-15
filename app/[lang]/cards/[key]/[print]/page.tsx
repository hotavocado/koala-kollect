import type { Metadata } from "next";
import { Suspense } from "react";
import { getI18n } from "@/lib/i18n";
import { PrintDetailView } from "./print-detail";
import { Alternates } from "../../../_site/alternates";
import { SiteHeader } from "../../../_site/site-header";
import { ImageCredit } from "../../../_site/image-credit";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.printTitle, description: t.meta.printDescription };
}

// Same shape as the card page: a static header, the keys read inside Suspense.
export default async function PrintPage({ params }: { params: Promise<{ key: string; print: string }> }) {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader back="cards" />
      <main className="container flex-1 pb-12 pt-4">
        <Suspense fallback={<p className="text-sm text-muted-foreground">{t.cards.loadingPrinting}</p>}>
          {params.then(({ key, print }) => (
            <>
              <Alternates path={`/cards/${key}/${print}`} />
              <PrintDetailView cardKey={key} printKey={print} />
            </>
          ))}
        </Suspense>
      </main>
      <ImageCredit />
    </div>
  );
}
