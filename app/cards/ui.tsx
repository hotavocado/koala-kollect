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

export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-layer-1 p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
