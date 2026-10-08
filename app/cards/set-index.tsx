"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { CardSetRow } from "@/convex/cards";
import { Notice, SET_KIND_HEADING } from "./ui";

// Providers mounts Convex only when NEXT_PUBLIC_CONVEX_URL is set, and the
// hooks below throw without it, so the check has to sit above them.
export function SetIndex() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <Notice title="The card database isn't connected">
        This build has no Convex deployment configured.
      </Notice>
    );
  }
  return <ConnectedIndex />;
}

function ConnectedIndex() {
  const sets = useQuery(api.cards.sets, {});
  if (sets === undefined) return <p className="text-sm text-muted-foreground">Loading sets…</p>;
  if (sets.length === 0) return <EmptyDatabase />;

  // The query returns sets in index order, so consecutive rows share a kind.
  const sections: { kind: CardSetRow["kind"]; sets: CardSetRow[] }[] = [];
  for (const set of sets) {
    const last = sections[sections.length - 1];
    if (last?.kind === set.kind) last.sets.push(set);
    else sections.push({ kind: set.kind, sets: [set] });
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">
        Newest release first in each group, by the English release date. A set with no English release
        shows its Japanese date, marked JP.
      </p>
      {sections.map((section) => (
        <section key={section.kind}>
          <h2 className="text-lg font-semibold">{SET_KIND_HEADING[section.kind]}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {section.sets.map((set) => (
              <li key={set.slug}>
                <SetRow set={set} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SetRow({ set }: { set: CardSetRow }) {
  return (
    <Link
      href={`/cards/set/${set.slug}`}
      className="flex min-h-14 items-center gap-3 rounded-lg bg-layer-1 px-4 py-3 transition-colors hover:bg-layer-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{set.title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {set.cardCount} card{set.cardCount === 1 ? "" : "s"}
          {set.releaseDate && (
            <>
              {" · "}
              <span className="whitespace-nowrap">
                {set.releaseSite === "jp" && "JP "}
                {formatReleaseDate(set.releaseDate)}
              </span>
            </>
          )}
        </span>
      </span>
      {set.code && (
        <span className="shrink-0 rounded-pill bg-layer-2 px-2.5 py-1 text-xs font-medium tabular-nums">
          {set.code}
        </span>
      )}
    </Link>
  );
}

// Empty is the expected state until the data repo publishes its first card
// list and the set index is built from it, so say that plainly.
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
    <Notice title="No sets yet">
      The database fills from the official card lists once the first one is published.{" "}
      {sync !== undefined && detail}
    </Notice>
  );
}

// A release date is a calendar day with no zone; format it in UTC so a viewer
// west of UTC doesn't see the day before.
function formatReleaseDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", dateStyle: "medium" });
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
