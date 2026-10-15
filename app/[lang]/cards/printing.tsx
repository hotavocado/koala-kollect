"use client";

import type { CardClaim, CardListing } from "@/convex/cards";
import { useI18n } from "@/lib/i18n/client";
import { confidenceShown, handoutWhen, productLabel, quantityNoteShown, releaseLabel } from "./ui";

// Shared by the card page and each print's page, so a print's origin reads the
// same in both places. The labels for each enum live in the dictionary.

export function ListingLine({ listing: l }: { listing: CardListing }) {
  const i18n = useI18n();
  const { t } = i18n;
  // The product is one site's own, so its date needs no JP mark.
  const released = releaseLabel({ releaseDate: l.releaseDate, releaseSite: null }, "day", i18n);
  return (
    <span className={l.removedAt ? "text-muted-foreground" : undefined}>
      {productLabel(l, t)}
      {released && <span className="text-muted-foreground"> · {released}</span>}
      {l.removedAt && <span> · {t.listing.noLongerListed}</span>}
    </span>
  );
}

export function ClaimLine({ claim: c }: { claim: CardClaim }) {
  const i18n = useI18n();
  const { t } = i18n;
  const d = c.distribution;
  const facts = [
    d && t.distributionKind[d.kind],
    d && t.region[d.region],
    c.tier && t.tier[c.tier],
    handoutWhen(c.startsOn, c.endsOn, i18n),
  ].filter(Boolean);
  const inferred = c.confidence === "inferred";
  const note = quantityNoteShown(c.quantityNote, c.quote);
  const shown = confidenceShown(c.source, c.confidence);
  const confidence = shown && t.confidence[shown];
  return (
    // An inferred claim is set apart, so it never reads as settled.
    <div
      className={`flex flex-col gap-0.5 ${inferred ? "border-l-2 border-dashed border-muted-foreground/50 pl-2" : ""}`}
    >
      <span className="font-medium">{d ? d.name : t.claim.unknownSource}</span>
      {facts.length > 0 && <span className="text-muted-foreground">{facts.join(" · ")}</span>}
      {note && <span className="text-muted-foreground">{note}</span>}
      <span className="break-words">“{c.quote}”</span>
      <span className="text-xs text-muted-foreground">
        {confidence && (
          <>
            <span className={inferred ? "font-medium text-foreground" : undefined}>{confidence}</span>
            {" · "}
          </>
        )}
        <OfficialLink href={c.sourceUrl}>{t.source[c.source]}</OfficialLink>
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
  const { t } = useI18n();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`underline underline-offset-4 hover:text-foreground ${className ?? ""}`}
    >
      {children}
      <span className="sr-only"> {t.site.opensInNewTab}</span>
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}
