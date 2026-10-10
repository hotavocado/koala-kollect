import Link from "next/link";
import { CardImage } from "./card-image";
import type { BrowseCard } from "@/convex/cards";
import { cardLabel, ColorDots } from "./ui";

export function CardTile({ card }: { card: BrowseCard }) {
  const label = cardLabel(card);
  // The text face stands in when the card has no official image, or it fails.
  const face = (
    <CardImage
      imageUrl={card.imageUrl}
      size="tile"
      alt={label}
      className="aspect-[63/88] w-full rounded-md bg-layer-2 object-cover"
      fallback={
        <div className="flex aspect-[63/88] flex-col items-center justify-center gap-1 rounded-md bg-layer-2 p-3 text-center">
          {card.number && <span className="text-lg font-semibold tracking-tight">{card.number}</span>}
          <span className="line-clamp-3 text-xs text-muted-foreground">{label}</span>
        </div>
      }
    />
  );
  return (
    <Link
      href={`/cards/${card.key}`}
      className="flex flex-col gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {face}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        {/* Wraps rather than truncates: two columns at phone width cut the printing count. */}
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <ColorDots colors={card.colors} />
          {card.number && <span>{card.number}</span>}
          <span className="whitespace-nowrap">
            {card.printings} printing{card.printings === 1 ? "" : "s"}
          </span>
        </p>
      </div>
    </Link>
  );
}
