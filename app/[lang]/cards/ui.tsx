import type { Doc } from "@/convex/_generated/dataModel";
import { SITE_LOCALE } from "@/convex/lang";
import type { Dict } from "@/lib/i18n/en";
import { fill } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/client";
import { LOCALE_TAG, type Locale } from "@/lib/i18n/locales";

// Pieces the browse grid and the card page share.

export const COLOR_DOT: Record<Doc<"cards">["colors"][number], string> = {
  red: "bg-custom-red-saturated",
  green: "bg-custom-green-saturated",
  blue: "bg-custom-blue-saturated",
  purple: "bg-custom-purple-saturated",
  black: "bg-foreground",
  yellow: "bg-custom-yellow-saturated",
};

// Rendered by Client Components only: it reads the language from context.
export function ColorDots({ colors }: { colors: Doc<"cards">["colors"] }) {
  const { t } = useI18n();
  return colors.map((c) => (
    <span key={c} aria-label={t.color[c]} className={`size-2 shrink-0 rounded-full ${COLOR_DOT[c]}`} />
  ));
}

// What to call a card. DON cards have no number and no printed name, so the
// design's art slug ("OP-01:monkey-d-luffy") is what tells them apart.
export function cardLabel(
  card: {
    name: string | null;
    category: Doc<"cards">["category"];
    number: string | null;
    donDesign: string | null;
  },
  t: Dict,
): string {
  if (card.name) return card.name;
  if (card.category === "don") {
    const slug = card.donDesign?.split(":")[1];
    if (!slug) return "DON!!";
    const art = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return `DON!! ${art}`;
  }
  return card.number ?? t.card.unnamed;
}

// A release date as the index, the set page and the card page show it. It is a
// calendar day with no zone, so it formats in UTC and a viewer west of UTC
// doesn't see the day before. The index reads months, so a row stays on one
// line at phone width; the set page carries the day. A date taken from the
// Japanese site because there is no English release is marked JP.
export function releaseLabel(
  set: { releaseDate: string | null; releaseSite: "en" | "jp" | null },
  precision: "month" | "day",
  { tag, t }: { tag: string; t: Dict },
): string | null {
  if (!set.releaseDate) return null;
  const mark = (date: string) => (set.releaseSite === "jp" ? fill(t.jpDate, { date }) : date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(set.releaseDate)) return mark(set.releaseDate);
  const style: Intl.DateTimeFormatOptions =
    precision === "month" ? { month: "short", year: "numeric" } : { dateStyle: "medium" };
  return mark(new Date(`${set.releaseDate}T00:00:00Z`).toLocaleDateString(tag, { timeZone: "UTC", ...style }));
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

export function handoutWhen(
  startsOn: string | null,
  endsOn: string | null,
  { tag, t }: { tag: string; t: Dict },
): string | null {
  if (startsOn && endsOn && startsOn !== endsOn) {
    return fill(t.claim.range, { from: partialDate(startsOn, tag), to: partialDate(endsOn, tag) });
  }
  if (startsOn) return partialDate(startsOn, tag);
  if (endsOn) return fill(t.claim.until, { date: partialDate(endsOn, tag) });
  return null;
}

// A claim's quantity note is often the quote itself, word for word. The quote is the
// source's own text, so it stays and a note that only repeats it is dropped.
export function quantityNoteShown(note: string | null, quote: string): string | null {
  const plain = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  if (!note || !plain(note)) return null;
  return plain(note) === plain(quote) ? null : note;
}

// The confidence a claim line names. A tcgcsv claim's only source is TCGplayer's
// own grouping, which its TCGplayer link already names, so "corroborated" there
// would read as two sources agreeing and is not shown. "inferred" always is: it
// is the word that keeps a claim from reading as settled.
export function confidenceShown<C extends string>(source: string, confidence: C): C | null {
  return source === "tcgcsv" && confidence !== "inferred" ? null : confidence;
}

// Every printing of the card is on cn's list and no other site's (P-122 to
// P-134, Special Card Set vol.2). Such a card has only Chinese text and no
// official page to link to, and the card page says why.
export function cnOnly(regions: { language: string }[]): boolean {
  return regions.length > 0 && regions.every((r) => r.language === "cn");
}

type TextSite = Doc<"card_observations">["site"];

// The lang attribute for text read off a site's card list, so a Japanese or
// Chinese name renders in its own script's glyphs on any page.
export function siteTag(site: TextSite | null): string | undefined {
  return site ? LOCALE_TAG[SITE_LOCALE[site]] : undefined;
}

// Whether a site's text is in another language than the page's: always on ko
// and fr, which have no card list of their own, and on en for a JP-only card.
export function foreignText(site: TextSite | null, lang: Locale): boolean {
  return site !== null && SITE_LOCALE[site] !== lang;
}

// "Card text in Japanese." TCGplayer's catalogue is English.
export function textInLine(site: TextSite, t: Dict): string {
  return fill(t.card.textIn, { language: t.siteLanguage[site === "tcgcsv" ? "en" : site] });
}

export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-layer-1 p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

