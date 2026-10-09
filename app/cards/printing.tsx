"use client";

import type { CardClaim, CardListing, CardPrinting, CardRegion } from "@/convex/cards";
import { handoutWhen, quantityNoteShown, releaseLabel } from "./ui";

// Shared by the card page and each print's page, so a print's origin reads the
// same in both places.
export const SITE_LABEL: Record<CardRegion["site"], string> = {
  en: "English",
  "asia-en": "Asia English",
  jp: "Japanese",
  tc: "Traditional Chinese",
  cn: "Simplified Chinese",
  tcgcsv: "TCGplayer",
};

export const VARIANT_LABEL: Record<CardPrinting["variant"], string> = {
  base: "Base",
  normal: "Normal",
  foil: "Foil",
  parallel: "Parallel",
  alt_art: "Alt art",
  gold: "Gold",
  reprint: "Reprint",
  manga: "Manga",
  serial: "Serial",
  other: "Other",
};

export const SOURCE_LABEL: Record<CardClaim["source"], string> = {
  official_cardlist: "Official card list",
  official_event: "Official event page",
  official_topic: "Official news",
  tcgcsv: "TCGplayer",
  namuwiki: "Namuwiki",
  manual: "Added by hand",
};

// An official claim's source link already says so, so it carries no label.
export const CONFIDENCE_LABEL: Record<CardClaim["confidence"], string | null> = {
  authoritative: null,
  corroborated: "Corroborated",
  inferred: "Inferred, not yet confirmed",
};

type Distribution = NonNullable<CardClaim["distribution"]>;

export const KIND_LABEL: Record<Distribution["kind"], string> = {
  promo_pack: "Promo pack",
  tournament_prize: "Tournament prize",
  participation: "Participation prize",
  event_pack: "Event pack",
  meetup: "Meetup",
  pre_release: "Pre-release",
  magazine_insert: "Magazine insert",
  retail_tieup: "Retail tie-in",
  bundle: "Bundle",
  movie: "Movie handout",
  championship: "Championship",
  store_tournament: "Store tournament",
  online: "Online",
  other: "Other",
};

export const REGION_LABEL: Record<Distribution["region"], string> = {
  en: "English region",
  asia: "Asia",
  jp: "Japan",
  cn: "China",
};

export const TIER_LABEL: Record<NonNullable<CardClaim["tier"]>, string> = {
  participant: "For participants",
  winner: "For winners",
  finalist: "For finalists",
  top_cut: "For the top cut",
  judge: "For judges",
  all: "For everyone",
};

export function ListingLine({ listing: l }: { listing: CardListing }) {
  // A listing whose product row has not synced still shows, by its series id.
  const name = l.nameEn ?? l.name ?? `Series ${l.productKey.split(":")[1] ?? l.productKey}`;
  // The product is one site's own, so its date needs no JP mark.
  const released = releaseLabel({ releaseDate: l.releaseDate, releaseSite: null }, "day");
  return (
    <span className={l.removedAt ? "text-muted-foreground" : undefined}>
      {[l.code, name].filter(Boolean).join(" ")}
      {released && <span className="text-muted-foreground"> · {released}</span>}
      {l.removedAt && <span> · no longer listed</span>}
    </span>
  );
}

export function ClaimLine({ claim: c }: { claim: CardClaim }) {
  const d = c.distribution;
  const facts = [
    d && KIND_LABEL[d.kind],
    d && REGION_LABEL[d.region],
    c.tier && TIER_LABEL[c.tier],
    handoutWhen(c.startsOn, c.endsOn),
  ].filter(Boolean);
  const inferred = c.confidence === "inferred";
  const note = quantityNoteShown(c.quantityNote, c.quote);
  return (
    // An inferred claim is set apart, so it never reads as settled.
    <div
      className={`flex flex-col gap-0.5 ${inferred ? "border-l-2 border-dashed border-muted-foreground/50 pl-2" : ""}`}
    >
      <span className="font-medium">{d ? d.name : "A source not yet in the database"}</span>
      {facts.length > 0 && <span className="text-muted-foreground">{facts.join(" · ")}</span>}
      {note && <span className="text-muted-foreground">{note}</span>}
      <span className="break-words">“{c.quote}”</span>
      <span className="text-xs text-muted-foreground">
        {CONFIDENCE_LABEL[c.confidence] && (
          <>
            <span className={inferred ? "font-medium text-foreground" : undefined}>{CONFIDENCE_LABEL[c.confidence]}</span>
            {" · "}
          </>
        )}
        <OfficialLink href={c.sourceUrl}>{SOURCE_LABEL[c.source]}</OfficialLink>
      </span>
    </div>
  );
}

// The text face, when the card has no official image or it fails to load.
export function CardFace({ number, label }: { number: string | null; label: string }) {
  return (
    <div className="mx-auto flex aspect-[63/88] w-full max-w-[240px] flex-col items-center justify-center gap-2 rounded-md bg-layer-2 p-4 text-center">
      {number && <span className="text-3xl font-semibold tracking-tight">{number}</span>}
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export function OfficialLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
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

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
