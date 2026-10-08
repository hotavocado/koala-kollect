"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { BrowseCard } from "@/convex/cards";
import { cardLabel, ColorDots, Notice } from "./ui";

const PAGE_SIZE = 24;

// Providers mounts Convex only when NEXT_PUBLIC_CONVEX_URL is set, and the
// hooks below throw without it, so the check has to sit above them.
export function CardBrowser() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <Notice title="The card database isn't connected">
        This build has no Convex deployment configured.
      </Notice>
    );
  }
  return <ConnectedBrowser />;
}

function ConnectedBrowser() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.cards.browse,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  if (status === "LoadingFirstPage") {
    return <p className="text-sm text-muted-foreground">Loading cards…</p>;
  }
  if (results.length === 0) return <EmptyDatabase />;

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 xs:grid-cols-4 lg:grid-cols-6">
        {results.map((card) => (
          <li key={card.key}>
            <CardTile card={card} />
          </li>
        ))}
      </ul>
      {status !== "Exhausted" && (
        <button
          type="button"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(PAGE_SIZE)}
          className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-pill bg-layer-2 px-6 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60 xs:w-auto"
        >
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}

// Empty is the expected state until the data repo publishes its first card
// list, so say that plainly rather than show an empty grid.
function EmptyDatabase() {
  const sync = useQuery(api.cards.lastSync, {});
  let detail = "No sync has run yet.";
  if (sync) {
    const when = formatWhen(sync.finishedAt ?? sync.startedAt);
    detail =
      sync.status === "ok"
        ? `Last synced ${when}.`
        : sync.status === "running"
          ? `A sync started ${when} and is still running.`
          : `Last checked ${when}, and no card list was ready to load.`;
  }
  return (
    <Notice title="No cards yet">
      The database fills from the official card lists once the first one is published.{" "}
      {sync !== undefined && detail}
    </Notice>
  );
}

function CardTile({ card }: { card: BrowseCard }) {
  const label = cardLabel(card);
  // A text face, not the image: the official image hosts send
  // Cross-Origin-Resource-Policy: same-site, so every browser refuses to load
  // them here. card.imageUrl stays in the data as the image's locator.
  const face = (
    <div className="flex aspect-[63/88] flex-col items-center justify-center gap-1 rounded-md bg-layer-2 p-3 text-center">
      {card.number && <span className="text-lg font-semibold tracking-tight">{card.number}</span>}
      <span className="line-clamp-3 text-xs text-muted-foreground">{label}</span>
    </div>
  );
  return (
    <Link
      href={`/cards/${card.key}`}
      className="flex flex-col gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {face}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ColorDots colors={card.colors} />
          <span className="truncate">
            {[card.number, `${card.printings} printing${card.printings === 1 ? "" : "s"}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </p>
      </div>
    </Link>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
