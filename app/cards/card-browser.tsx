"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { BrowseCard } from "@/convex/cards";

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

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-layer-1 p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

const COLOR_DOT: Record<BrowseCard["colors"][number], string> = {
  red: "bg-custom-red-saturated",
  green: "bg-custom-green-saturated",
  blue: "bg-custom-blue-saturated",
  purple: "bg-custom-purple-saturated",
  black: "bg-foreground",
  yellow: "bg-custom-yellow-saturated",
};

function CardTile({ card }: { card: BrowseCard }) {
  const label = card.name ?? (card.category === "don" ? "DON!!" : (card.number ?? "Unnamed card"));
  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[63/88] overflow-hidden rounded-md bg-layer-2">
        {card.imageUrl ? (
          // A plain img on purpose: images are the official sites' own URLs,
          // linked and never re-hosted, and next/image would proxy them.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt={label}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            No image
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {card.colors.map((c) => (
            <span key={c} aria-label={c} className={`size-2 rounded-full ${COLOR_DOT[c]}`} />
          ))}
          <span className="truncate">
            {[card.number, `${card.printings} printing${card.printings === 1 ? "" : "s"}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </p>
      </div>
    </div>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
