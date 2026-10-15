"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { CardImage } from "../card-image";
import type { CardDetail, CardPrinting } from "@/convex/cards";
import { useI18n } from "@/lib/i18n/client";
import { CardFace, OfficialLink } from "../printing";
import { cardLabel, cnOnly, ColorDots, foreignText, Notice, productLabel, siteTag, textInLine } from "../ui";

// Same guard as the browse page: the Convex hooks throw without a deployment.
export function CardDetailView({ cardKey }: { cardKey: string }) {
  const { t } = useI18n();
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <Notice title={t.site.notConnectedTitle}>{t.site.notConnectedBody}</Notice>;
  }
  return <ConnectedDetail cardKey={cardKey} />;
}

function ConnectedDetail({ cardKey }: { cardKey: string }) {
  const { t, href, lang } = useI18n();
  const card = useQuery(api.cards.detail, { key: cardKey, lang });
  if (card === undefined) return <p className="text-sm text-muted-foreground">{t.cards.loadingCard}</p>;
  if (card === null) {
    return (
      <Notice title={t.card.notFoundTitle}>
        {t.card.notFoundBody}{" "}
        <Link href={href("/cards")} className="underline underline-offset-4 hover:text-foreground">
          {t.card.browse}
        </Link>
      </Notice>
    );
  }
  return <Detail card={card} />;
}

function Detail({ card }: { card: CardDetail }) {
  const { t, lang, fill, plural } = useI18n();
  const label = cardLabel({ ...card, name: card.text?.name ?? null }, t);
  const textTag = siteTag(card.text?.site ?? null);
  const total = card.regions.reduce((n, r) => n + r.printings.length, 0);
  const stats = (
    [
      [t.stat.cost, card.cost],
      [t.stat.life, card.life],
      [t.stat.power, card.power],
      [t.stat.counter, card.counter],
    ] as const
  ).filter(([, value]) => value !== null);

  return (
    <article className="flex flex-col gap-10">
      <section className="grid gap-6 xs:grid-cols-[minmax(0,240px)_1fr] xs:items-start">
        <CardImage
          imageUrl={card.imageUrl}
          alt={label}
          className="mx-auto aspect-[63/88] w-full max-w-[240px] rounded-md bg-layer-2 object-cover"
          fallback={<CardFace number={card.number} label={label} />}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <h1 lang={textTag} className="text-3xl font-semibold">
              {label}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <ColorDots colors={card.colors} />
              <span>{[card.number, t.category[card.category]].filter(Boolean).join(" · ")}</span>
            </p>
            {card.officialUrl && (
              <p className="mt-2 text-sm">
                <OfficialLink href={card.officialUrl}>{t.card.officialPage}</OfficialLink>
              </p>
            )}
            {cnOnly(card.regions) && (
              <p className="mt-2 text-sm text-muted-foreground">{t.card.cnOnly}</p>
            )}
            {card.donDesign && (
              <p className="mt-2 text-sm text-muted-foreground">{t.card.donSource}</p>
            )}
          </div>

          {stats.length > 0 && (
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {stats.map(([name, value]) => (
                <div key={name}>
                  <dt className="text-xs text-muted-foreground">{name}</dt>
                  <dd className="text-lg font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {(card.attributes.length > 0 || (card.text?.types.length ?? 0) > 0) && (
            <p className="text-sm">
              {[...card.attributes.map((a) => t.attribute[a]), ...(card.text?.types ?? [])].join(" · ")}
            </p>
          )}

          {card.text?.effect && (
            <p lang={textTag} className="whitespace-pre-line rounded-lg bg-layer-1 p-4 text-sm">
              {card.text.effect}
            </p>
          )}
          {card.text?.trigger && (
            <p className="whitespace-pre-line rounded-lg bg-layer-1 p-4 text-sm">
              <span className="font-medium">{t.card.trigger} </span>
              <span lang={textTag}>{card.text.trigger}</span>
            </p>
          )}
          {/* One line under the text: its language when that is not the
              page's, else where it was read. The language says the source too. */}
          {card.text && (
            <p className="text-xs text-muted-foreground">
              {foreignText(card.text.site, lang)
                ? textInLine(card.text.site, t)
                : card.text.site === "tcgcsv"
                  ? t.card.textFromTcgplayer
                  : fill(t.card.textFrom, { site: t.siteLanguage[card.text.site] })}
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <h2 className="text-2xl font-semibold">{plural(t.count.printings, total)}</h2>
        {card.regions.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.card.noPrintings}</p>
        )}
        {card.regions.map((region) => (
          <div key={region.language} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-lg font-semibold">
                {t.siteLanguage[region.language]}{" "}
                <span className="font-normal text-muted-foreground">{region.printings.length}</span>
              </h3>
              {region.listUrl && (
                <OfficialLink href={region.listUrl} className="text-sm">
                  {t.card.onSiteList}
                </OfficialLink>
              )}
            </div>
            <ul className="flex flex-col gap-3">
              {region.printings.map((p) => (
                <li key={p.key}>
                  <PrintingRow cardKey={card.key} label={label} printing={p} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </article>
  );
}

// One print, linked to its own page. The row shows the print's own image and
// what it is; its listings and origin claims live on the print page.
function PrintingRow({ cardKey, label, printing: p }: { cardKey: string; label: string; printing: CardPrinting }) {
  const { t, href, fill, plural } = useI18n();
  return (
    <Link
      href={href(`/cards/${cardKey}/${p.key}`)}
      className="flex gap-4 rounded-lg bg-layer-1 p-4 transition-colors hover:bg-layer-2"
    >
      <CardImage
        imageUrl={p.imageUrl}
        size="thumb"
        alt={`${label}, ${t.variant[p.variant]}`}
        className="aspect-[63/88] w-16 shrink-0 rounded bg-layer-2 object-cover xs:w-20"
        fallback={<ThumbFace text={t.variant[p.variant]} />}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          {[p.rarity, t.variant[p.variant], ...p.imageIds, p.site === "tcgcsv" ? t.card.fromTcgplayer : null]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {/* The provenance string is the card list's own words, shown verbatim. */}
        {p.sourceText ? (
          <p className="break-words text-base font-medium">{p.sourceText}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {p.site === "tcgcsv" ? t.card.noSourceTcgplayer : t.card.noSourceList}
          </p>
        )}

        {/* The origin, one of the two, never both: the real product when one
            lists the print, else the distribution and how many sources say so. */}
        {p.origin?.kind === "product" && (
          <p className="text-sm text-muted-foreground">{fill(t.card.from, { origins: productLabel(p.origin, t) })}</p>
        )}
        {p.origin?.kind === "distribution" && (
          <p className="text-sm text-muted-foreground">
            {fill(t.card.from, { origins: p.origin.names.join(", ") })} · {plural(t.count.sources, p.claims.length)}
          </p>
        )}
        {/* Claims whose distribution has not synced yet still count as sources. */}
        {p.origin === null && p.claims.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t.card.whereFrom} · {plural(t.count.sources, p.claims.length)}
          </p>
        )}
      </div>
      <span aria-hidden="true" className="self-center text-muted-foreground">
        ›
      </span>
    </Link>
  );
}

// A thumbnail's stand-in when the print has no image yet.
function ThumbFace({ text }: { text: string }) {
  return (
    <div className="flex aspect-[63/88] w-16 shrink-0 items-center justify-center rounded bg-layer-2 p-1 text-center text-[10px] text-muted-foreground xs:w-20">
      {text}
    </div>
  );
}
