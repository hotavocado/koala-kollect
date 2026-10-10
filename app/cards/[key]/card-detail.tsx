"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { CardImage } from "../card-image";
import type { CardDetail, CardPrinting, CardRegion } from "@/convex/cards";
import { capitalize, CardFace, OfficialLink, SITE_LABEL, VARIANT_LABEL } from "../printing";
import { cardLabel, cnOnly, ColorDots, Notice } from "../ui";

// Same guard as the browse page: the Convex hooks throw without a deployment.
export function CardDetailView({ cardKey }: { cardKey: string }) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <Notice title="The card database isn't connected">
        This build has no Convex deployment configured.
      </Notice>
    );
  }
  return <ConnectedDetail cardKey={cardKey} />;
}

function ConnectedDetail({ cardKey }: { cardKey: string }) {
  const card = useQuery(api.cards.detail, { key: cardKey });
  if (card === undefined) return <p className="text-sm text-muted-foreground">Loading card…</p>;
  if (card === null) {
    return (
      <Notice title="Card not found">
        There is no card with this link in the database.{" "}
        <Link href="/cards" className="underline underline-offset-4 hover:text-foreground">
          Browse the cards
        </Link>
      </Notice>
    );
  }
  return <Detail card={card} />;
}

function Detail({ card }: { card: CardDetail }) {
  const label = cardLabel({ ...card, name: card.text?.name ?? null });
  const total = card.regions.reduce((n, r) => n + r.printings.length, 0);
  const stats = (
    [
      ["Cost", card.cost],
      ["Life", card.life],
      ["Power", card.power],
      ["Counter", card.counter],
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
            <h1 className="text-3xl font-semibold">{label}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <ColorDots colors={card.colors} />
              <span>{[card.number, capitalize(card.category)].filter(Boolean).join(" · ")}</span>
            </p>
            {card.officialUrl && (
              <p className="mt-2 text-sm">
                <OfficialLink href={card.officialUrl}>See the card on the official card list</OfficialLink>
              </p>
            )}
            {cnOnly(card.regions) && (
              <p className="mt-2 text-sm text-muted-foreground">
                Listed only on the Simplified Chinese card list, so its name and text are in Chinese, and there is
                no official page to link to.
              </p>
            )}
            {card.donDesign && (
              <p className="mt-2 text-sm text-muted-foreground">
                No official card list carries DON!! cards, so this one comes from TCGplayer&apos;s catalogue. The
                name is TCGplayer&apos;s, and each printing&apos;s page links to its TCGplayer listing.
              </p>
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
              {[...card.attributes.map(capitalize), ...(card.text?.types ?? [])].join(" · ")}
            </p>
          )}

          {card.text?.effect && (
            <p className="whitespace-pre-line rounded-lg bg-layer-1 p-4 text-sm">{card.text.effect}</p>
          )}
          {card.text?.trigger && (
            <p className="whitespace-pre-line rounded-lg bg-layer-1 p-4 text-sm">
              <span className="font-medium">Trigger </span>
              {card.text.trigger}
            </p>
          )}
          {card.text && (
            <p className="text-xs text-muted-foreground">
              {card.text.site === "tcgcsv"
                ? "Name from TCGplayer's catalogue."
                : `Text from the ${SITE_LABEL[card.text.site]} card list.`}
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <h2 className="text-2xl font-semibold">
          {total} printing{total === 1 ? "" : "s"}
        </h2>
        {card.regions.length === 0 && (
          <p className="text-sm text-muted-foreground">No printings of this card are listed yet.</p>
        )}
        {card.regions.map((region) => (
          <div key={region.site} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-lg font-semibold">
                {SITE_LABEL[region.site]}{" "}
                <span className="font-normal text-muted-foreground">{region.printings.length}</span>
              </h3>
              {region.listUrl && (
                <OfficialLink href={region.listUrl} className="text-sm">
                  On this site&apos;s card list
                </OfficialLink>
              )}
            </div>
            <ul className="flex flex-col gap-3">
              {region.printings.map((p) => (
                <li key={p.key}>
                  <PrintingRow cardKey={card.key} label={label} printing={p} site={region.site} />
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
function PrintingRow({ cardKey, label, printing: p, site }: { cardKey: string; label: string; printing: CardPrinting; site: CardRegion["site"] }) {
  const origins = [...new Set(p.claims.map((c) => c.distribution?.name).filter(Boolean))];
  return (
    <Link
      href={`/cards/${cardKey}/${p.key}`}
      className="flex gap-4 rounded-lg bg-layer-1 p-4 transition-colors hover:bg-layer-2"
    >
      <CardImage
        imageUrl={p.imageUrl}
        size="thumb"
        alt={`${label}, ${VARIANT_LABEL[p.variant]}`}
        className="aspect-[63/88] w-16 shrink-0 rounded bg-layer-2 object-cover xs:w-20"
        fallback={<ThumbFace text={VARIANT_LABEL[p.variant]} />}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          {[p.rarity, VARIANT_LABEL[p.variant], ...p.imageIds].join(" · ")}
        </p>

        {/* The provenance string is the card list's own words, shown verbatim. */}
        {p.sourceText ? (
          <p className="break-words text-base font-medium">{p.sourceText}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {site === "tcgcsv"
              ? "TCGplayer lists no source for this printing."
              : "The card list prints no source for this printing."}
          </p>
        )}

        {p.claims.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {origins.length > 0 ? `From ${origins.join(", ")}` : "Where it came from"} · {p.claims.length} source
            {p.claims.length === 1 ? "" : "s"}
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
