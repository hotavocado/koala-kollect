import type { Doc } from "@/convex/_generated/dataModel";

// Pieces the browse grid and the card page share.

export const COLOR_DOT: Record<Doc<"cards">["colors"][number], string> = {
  red: "bg-custom-red-saturated",
  green: "bg-custom-green-saturated",
  blue: "bg-custom-blue-saturated",
  purple: "bg-custom-purple-saturated",
  black: "bg-foreground",
  yellow: "bg-custom-yellow-saturated",
};

export function ColorDots({ colors }: { colors: Doc<"cards">["colors"] }) {
  return colors.map((c) => (
    <span key={c} aria-label={c} className={`size-2 shrink-0 rounded-full ${COLOR_DOT[c]}`} />
  ));
}

// What to call a card. DON cards have no number and no printed name, so the
// design's art slug ("OP-01:monkey-d-luffy") is what tells them apart.
export function cardLabel(card: {
  name: string | null;
  category: Doc<"cards">["category"];
  number: string | null;
  donDesign: string | null;
}): string {
  if (card.name) return card.name;
  if (card.category === "don") {
    const slug = card.donDesign?.split(":")[1];
    if (!slug) return "DON!!";
    const art = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return `DON!! ${art}`;
  }
  return card.number ?? "Unnamed card";
}

// Section headings on the set index, one per card_sets kind.
export const SET_KIND_HEADING: Record<Doc<"card_sets">["kind"], string> = {
  booster: "Booster packs",
  extra: "Extra boosters",
  premium: "Premium boosters",
  starter: "Starter decks",
  promo: "Promotions",
  limited: "Limited products",
  family: "Family decks",
  other: "Other",
};

// One set's kind, as its page header names it.
export const SET_KIND_LABEL: Record<Doc<"card_sets">["kind"], string> = {
  booster: "Booster pack",
  extra: "Extra booster",
  premium: "Premium booster",
  starter: "Starter deck",
  promo: "Promotion",
  limited: "Limited product",
  family: "Family deck",
  other: "Other",
};

// A release date as the index, the set page and the card page show it. It is a
// calendar day with no zone, so it formats in UTC and a viewer west of UTC
// doesn't see the day before. The index reads months, so a row stays on one
// line at phone width; the set page carries the day. A date taken from the
// Japanese site because there is no English release is marked JP.
export function releaseLabel(
  set: { releaseDate: string | null; releaseSite: "en" | "jp" | null },
  precision: "month" | "day",
  locale?: string,
): string | null {
  if (!set.releaseDate) return null;
  const prefix = set.releaseSite === "jp" ? "JP " : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(set.releaseDate)) return prefix + set.releaseDate;
  const style: Intl.DateTimeFormatOptions =
    precision === "month" ? { month: "short", year: "numeric" } : { dateStyle: "medium" };
  return prefix + new Date(`${set.releaseDate}T00:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC", ...style });
}

// A handout's dates, which a source may give only to the year or month
// (YYYY, YYYY-MM, or YYYY-MM-DD). Anything else is shown as written.
export function partialDate(value: string, locale?: string): string {
  const m = value.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!m) return value;
  if (!m[2]) return m[1];
  const iso = `${m[1]}-${m[2]}-${m[3] ?? "01"}`;
  const date = new Date(`${iso}T00:00:00Z`);
  // An impossible date (2025-02-31, 2025-13) would roll over or read
  // "Invalid Date"; show what the source wrote instead.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return value;
  const style: Intl.DateTimeFormatOptions = m[3] ? { dateStyle: "medium" } : { month: "short", year: "numeric" };
  return date.toLocaleDateString(locale, { timeZone: "UTC", ...style });
}

export function handoutWhen(startsOn: string | null, endsOn: string | null, locale?: string): string | null {
  if (startsOn && endsOn && startsOn !== endsOn) {
    return `${partialDate(startsOn, locale)} to ${partialDate(endsOn, locale)}`;
  }
  if (startsOn) return partialDate(startsOn, locale);
  if (endsOn) return `Until ${partialDate(endsOn, locale)}`;
  return null;
}

// A claim's quantity note is often the quote itself, word for word. The quote is the
// source's own text, so it stays and a note that only repeats it is dropped.
export function quantityNoteShown(note: string | null, quote: string): string | null {
  const plain = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  if (!note || !plain(note)) return null;
  return plain(note) === plain(quote) ? null : note;
}

// Every printing of the card is on cn's list and no other site's (P-122 to
// P-134, Special Card Set vol.2). Such a card has only Chinese text and no
// official page to link to, and the card page says why.
export function cnOnly(regions: { site: string }[]): boolean {
  return regions.length > 0 && regions.every((r) => r.site === "cn");
}

export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-layer-1 p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

// Shown wherever official card images are.
export function ImageCredit() {
  return (
    <footer className="container pb-8 text-xs text-muted-foreground">
      Card images © Eiichiro Oda/Shueisha, Toei Animation, from the official ONE PIECE CARD GAME card lists by
      Bandai. Koala Kollect is an unofficial fan project.
    </footer>
  );
}
