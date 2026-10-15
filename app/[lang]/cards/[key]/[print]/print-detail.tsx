"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { CardImage } from "../../card-image";
import type { PrintDetail } from "@/convex/cards";
import { useI18n } from "@/lib/i18n/client";
import { CardFace, ClaimLine, ListingLine, OfficialLink } from "../../printing";
import { cardLabel, ColorDots, Notice } from "../../ui";

// Same guard as the card page: the Convex hooks throw without a deployment.
export function PrintDetailView({ cardKey, printKey }: { cardKey: string; printKey: string }) {
  const { t } = useI18n();
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <Notice title={t.site.notConnectedTitle}>{t.site.notConnectedBody}</Notice>;
  }
  return <ConnectedPrint cardKey={cardKey} printKey={printKey} />;
}

function ConnectedPrint({ cardKey, printKey }: { cardKey: string; printKey: string }) {
  const { t, href } = useI18n();
  const print = useQuery(api.cards.print, { cardKey, printKey });
  if (print === undefined) return <p className="text-sm text-muted-foreground">{t.cards.loadingPrinting}</p>;
  if (print === null) {
    return (
      <Notice title={t.print.notFoundTitle}>
        {t.print.notFoundBody}{" "}
        <Link href={href(`/cards/${cardKey}`)} className="underline underline-offset-4 hover:text-foreground">
          {t.print.backToCard}
        </Link>
      </Notice>
    );
  }
  return <Print print={print} />;
}

function Print({ print: { card, site, language, listUrl, printing: p } }: { print: PrintDetail }) {
  const { t, href, fill } = useI18n();
  const label = cardLabel(card, t);
  return (
    <article className="flex flex-col gap-10">
      <section className="grid gap-6 xs:grid-cols-[minmax(0,240px)_1fr] xs:items-start">
        <CardImage
          imageUrl={p.imageUrl}
          alt={`${label}, ${t.variant[p.variant]}`}
          className="mx-auto aspect-[63/88] w-full max-w-[240px] rounded-md bg-layer-2 object-cover"
          fallback={<CardFace number={card.number} label={label} />}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="text-sm">
              <Link href={href(`/cards/${card.key}`)} className="underline underline-offset-4 hover:text-foreground">
                {fill(t.print.allPrintings, { name: label })}
              </Link>
            </p>
            <h1 className="mt-2 text-3xl font-semibold">{label}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <ColorDots colors={card.colors} />
              <span>{[card.number, p.rarity, t.variant[p.variant]].filter(Boolean).join(" · ")}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.siteLanguage[language]}
              {site === "tcgcsv" && ` · ${t.card.fromTcgplayer}`}
              {p.imageIds.length > 0 && ` · ${p.imageIds.join(" · ")}`}
            </p>
          </div>

          {/* The provenance string is the card list's own words, shown verbatim. */}
          {p.sourceText ? (
            <p className="break-words text-base font-medium">{p.sourceText}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {site === "tcgcsv" ? t.card.noSourceTcgplayer : t.card.noSourceList}
            </p>
          )}

          <div className="flex flex-col gap-1 text-sm">
            {p.tcgplayerUrl && <OfficialLink href={p.tcgplayerUrl}>{t.print.tcgplayerListing}</OfficialLink>}
            {listUrl && (
              <OfficialLink href={listUrl}>{fill(t.print.onSiteList, { site: t.siteLanguage[language] })}</OfficialLink>
            )}
          </div>

          <div className="rounded-lg bg-layer-1 p-4">
            <p className="text-xs text-muted-foreground">{t.print.price}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.print.priceNotLive}</p>
          </div>
        </div>
      </section>

      {p.listings.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold">{t.print.listedUnder}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {p.listings.map((l) => (
              <li key={l.productKey}>
                <ListingLine listing={l} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">{t.print.whereFrom}</h2>
        {p.claims.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.print.noOrigin}</p>
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {p.claims.map((c) => (
              <li key={c.key} className="rounded-lg bg-layer-1 p-4">
                <ClaimLine claim={c} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
