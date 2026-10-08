"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { CardClaim, CardDetail, CardListing, CardPrinting, CardRegion } from "@/convex/cards";
import { ColorDots, Notice } from "../ui";

const SITE_LABEL: Record<CardRegion["site"], string> = {
  en: "English",
  "asia-en": "Asia English",
  jp: "Japanese",
  tc: "Traditional Chinese",
  cn: "Simplified Chinese",
  tcgcsv: "TCGplayer",
};

const VARIANT_LABEL: Record<CardPrinting["variant"], string> = {
  base: "Base",
  parallel: "Parallel",
  alt_art: "Alt art",
  gold: "Gold",
  reprint: "Reprint",
  manga: "Manga",
  serial: "Serial",
  other: "Other",
};

const SOURCE_LABEL: Record<CardClaim["source"], string> = {
  official_cardlist: "Official card list",
  official_event: "Official event page",
  official_topic: "Official news",
  tcgcsv: "TCGplayer",
  namuwiki: "Namuwiki",
  manual: "Added by hand",
};

const CONFIDENCE_LABEL: Record<CardClaim["confidence"], string> = {
  authoritative: "Official",
  corroborated: "Corroborated",
  inferred: "Inferred",
};

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

function cardLabel(card: CardDetail): string {
  return card.text?.name ?? (card.category === "don" ? "DON!!" : (card.number ?? "Unnamed card"));
}

function Detail({ card }: { card: CardDetail }) {
  const label = cardLabel(card);
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
        <CardFace number={card.number} label={label} />
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
              Text from the {SITE_LABEL[card.text.site]} card list.
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
                  <PrintingRow printing={p} site={region.site} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </article>
  );
}

function PrintingRow({ printing: p, site }: { printing: CardPrinting; site: CardRegion["site"] }) {
  return (
    <div className="flex gap-4 rounded-lg bg-layer-1 p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
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

        {p.listings.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground">Listed under</p>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {p.listings.map((l) => (
                <li key={l.productKey}>
                  <ListingLine listing={l} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.claims.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground">Where it came from</p>
            <ul className="mt-1 flex flex-col gap-2 text-sm">
              {p.claims.map((c) => (
                <li key={c.key}>
                  <ClaimLine claim={c} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ListingLine({ listing: l }: { listing: CardListing }) {
  // A listing whose product row has not synced still shows, by its series id.
  const name = l.nameEn ?? l.name ?? `Series ${l.productKey.split(":")[1] ?? l.productKey}`;
  return (
    <span className={l.removedAt ? "text-muted-foreground" : undefined}>
      {[l.code, name].filter(Boolean).join(" ")}
      {l.releaseDate && <span className="text-muted-foreground"> · {l.releaseDate}</span>}
      {l.removedAt && <span> · no longer listed</span>}
    </span>
  );
}

function ClaimLine({ claim: c }: { claim: CardClaim }) {
  const d = c.distribution;
  const when = d ? [d.startsOn, d.endsOn].filter(Boolean).join(" to ") : "";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">
        {d ? d.name : "A source not yet in the database"}
        {d?.tier && <span className="font-normal text-muted-foreground"> · {capitalize(d.tier)}</span>}
        {when && <span className="font-normal text-muted-foreground"> · {when}</span>}
      </span>
      <span className="break-words">“{c.quote}”</span>
      <span className="text-xs text-muted-foreground">
        {CONFIDENCE_LABEL[c.confidence]} ·{" "}
        <a
          href={c.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          {SOURCE_LABEL[c.source]}
        </a>
      </span>
    </div>
  );
}

// A text face, not the image: the official image hosts send
// Cross-Origin-Resource-Policy: same-site, so every browser refuses to load
// them here. The image URLs stay in the data as locators.
function CardFace({ number, label }: { number: string | null; label: string }) {
  return (
    <div className="mx-auto flex aspect-[63/88] w-full max-w-[240px] flex-col items-center justify-center gap-2 rounded-md bg-layer-2 p-4 text-center">
      {number && <span className="text-3xl font-semibold tracking-tight">{number}</span>}
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function OfficialLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`underline underline-offset-4 hover:text-foreground ${className ?? ""}`}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
