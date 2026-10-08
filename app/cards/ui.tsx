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
