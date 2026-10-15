"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { BrowseCard } from "@/convex/cards";
import { CardTile } from "../../card-tile";
import { useI18n } from "@/lib/i18n/client";
import { Notice, releaseLabel } from "../../ui";

// Same guard as the index: the Convex hooks throw without a deployment.
export function SetCardsView({ slug }: { slug: string }) {
  const { t } = useI18n();
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <Notice title={t.site.notConnectedTitle}>{t.site.notConnectedBody}</Notice>;
  }
  return <ConnectedSet slug={slug} />;
}

function ConnectedSet({ slug }: { slug: string }) {
  const i18n = useI18n();
  const { t, plural, lang } = i18n;
  const result = useQuery(api.cards.setCards, { slug, lang });
  if (result === undefined) return <p className="text-sm text-muted-foreground">{t.cards.loadingSet}</p>;
  if (result === null) {
    return <Notice title={t.set.notFoundTitle}>{t.set.notFoundBody}</Notice>;
  }

  const { set, cards, fromOtherSets, don } = result;
  const total = cards.length + fromOtherSets.length + don.length;
  const released = releaseLabel(set, "day", i18n);
  return (
    <>
      <h1 className="text-3xl font-semibold">{set.title}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {set.code && (
          <span className="rounded-pill bg-layer-2 px-2.5 py-1 text-xs font-medium tabular-nums text-foreground">
            {set.code}
          </span>
        )}
        <span>
          {t.setKind[set.kind]} · {plural(t.count.cards, total)}
          {released && (
            <>
              {" · "}
              <span className="whitespace-nowrap">{released}</span>
            </>
          )}
        </span>
      </p>
      <CardGrid cards={cards} />
      {fromOtherSets.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t.set.fromOtherSets}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.set.fromOtherSetsBody}</p>
          <CardGrid cards={fromOtherSets} />
        </section>
      )}
      {don.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t.set.don}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.set.donBody}</p>
          <CardGrid cards={don} />
        </section>
      )}
    </>
  );
}

function CardGrid({ cards }: { cards: BrowseCard[] }) {
  return (
    <ul className="mt-6 grid grid-cols-2 gap-4 xs:grid-cols-4 lg:grid-cols-6">
      {cards.map((card) => (
        <li key={card.key}>
          <CardTile card={card} />
        </li>
      ))}
    </ul>
  );
}
