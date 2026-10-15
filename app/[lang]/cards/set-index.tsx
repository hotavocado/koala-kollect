"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { CardSetRow } from "@/convex/cards";
import { useI18n } from "@/lib/i18n/client";
import { Notice, releaseLabel } from "./ui";

// Providers mounts Convex only when NEXT_PUBLIC_CONVEX_URL is set, and the
// hooks below throw without it, so the check has to sit above them.
export function SetIndex() {
  const { t } = useI18n();
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <Notice title={t.site.notConnectedTitle}>{t.site.notConnectedBody}</Notice>;
  }
  return <ConnectedIndex />;
}

function ConnectedIndex() {
  const { t } = useI18n();
  const sets = useQuery(api.cards.sets, {});
  if (sets === undefined) return <p className="text-sm text-muted-foreground">{t.setIndex.loading}</p>;
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
      <p className="text-sm text-muted-foreground">{t.setIndex.order}</p>
      {sections.map((section) => (
        <section key={section.kind}>
          <h2 className="text-lg font-semibold">{t.setKindHeading[section.kind]}</h2>
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
  const i18n = useI18n();
  const { t, href, plural } = i18n;
  const released = releaseLabel(set, "month", i18n);
  return (
    <Link
      href={href(`/cards/set/${set.slug}`)}
      className="flex min-h-14 items-center gap-3 rounded-lg bg-layer-1 px-4 py-3 transition-colors hover:bg-layer-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{set.title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {plural(t.count.cards, set.cardCount)}
          {released && (
            <>
              {" · "}
              <span className="whitespace-nowrap">{released}</span>
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
  const { t, tag, fill } = useI18n();
  const sync = useQuery(api.cards.lastSync, {});
  let detail = t.setIndex.noSync;
  if (sync) {
    const when = formatWhen(sync.finishedAt ?? sync.startedAt, tag);
    detail = fill(
      sync.status === "ok"
        ? t.setIndex.syncedOk
        : sync.status === "running"
          ? t.setIndex.syncRunning
          : t.setIndex.syncNothing,
      { when },
    );
  }
  return (
    <Notice title={t.setIndex.emptyTitle}>
      {t.setIndex.emptyBody} {sync !== undefined && detail}
    </Notice>
  );
}

function formatWhen(iso: string, tag: string): string {
  return new Date(iso).toLocaleString(tag, { dateStyle: "medium", timeStyle: "short" });
}
