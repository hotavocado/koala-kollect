"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { CardImage } from "../../card-image";
import type { PrintDetail } from "@/convex/cards";
import { CardFace, ClaimLine, ListingLine, OfficialLink, SITE_LABEL, VARIANT_LABEL } from "../../printing";
import { cardLabel, ColorDots, Notice } from "../../ui";

// Same guard as the card page: the Convex hooks throw without a deployment.
export function PrintDetailView({ cardKey, printKey }: { cardKey: string; printKey: string }) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <Notice title="The card database isn't connected">
        This build has no Convex deployment configured.
      </Notice>
    );
  }
  return <ConnectedPrint cardKey={cardKey} printKey={printKey} />;
}

function ConnectedPrint({ cardKey, printKey }: { cardKey: string; printKey: string }) {
  const print = useQuery(api.cards.print, { cardKey, printKey });
  if (print === undefined) return <p className="text-sm text-muted-foreground">Loading printing…</p>;
  if (print === null) {
    return (
      <Notice title="Printing not found">
        There is no printing with this link in the database.{" "}
        <Link href={`/cards/${cardKey}`} className="underline underline-offset-4 hover:text-foreground">
          Back to the card
        </Link>
      </Notice>
    );
  }
  return <Print print={print} />;
}

function Print({ print: { card, site, listUrl, printing: p } }: { print: PrintDetail }) {
  const label = cardLabel(card);
  return (
    <article className="flex flex-col gap-10">
      <section className="grid gap-6 xs:grid-cols-[minmax(0,240px)_1fr] xs:items-start">
        <CardImage
          imageUrl={p.imageUrl}
          alt={`${label}, ${VARIANT_LABEL[p.variant]}`}
          className="mx-auto aspect-[63/88] w-full max-w-[240px] rounded-md bg-layer-2 object-cover"
          fallback={<CardFace number={card.number} label={label} />}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="text-sm">
              <Link href={`/cards/${card.key}`} className="underline underline-offset-4 hover:text-foreground">
                All printings of {label}
              </Link>
            </p>
            <h1 className="mt-2 text-3xl font-semibold">{label}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <ColorDots colors={card.colors} />
              <span>{[card.number, p.rarity, VARIANT_LABEL[p.variant]].filter(Boolean).join(" · ")}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {SITE_LABEL[site]}
              {p.imageIds.length > 0 && ` · ${p.imageIds.join(" · ")}`}
            </p>
          </div>

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

          <div className="flex flex-col gap-1 text-sm">
            {p.tcgplayerUrl && <OfficialLink href={p.tcgplayerUrl}>TCGplayer listing</OfficialLink>}
            {listUrl && <OfficialLink href={listUrl}>On the {SITE_LABEL[site]} card list</OfficialLink>}
          </div>

          <div className="rounded-lg bg-layer-1 p-4">
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="mt-1 text-sm text-muted-foreground">Price tracking for this printing isn&apos;t live yet.</p>
          </div>
        </div>
      </section>

      {p.listings.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold">Listed under</h2>
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
        <h2 className="text-2xl font-semibold">Where it came from</h2>
        {p.claims.length === 0 ? (
          <p className="text-sm text-muted-foreground">No source for this printing&apos;s origin is recorded yet.</p>
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
