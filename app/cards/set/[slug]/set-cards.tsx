"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { BrowseCard } from "@/convex/cards";
import { CardTile } from "../../card-tile";
import { Notice, releaseLabel, SET_KIND_LABEL } from "../../ui";

// Same guard as the index: the Convex hooks throw without a deployment.
export function SetCardsView({ slug }: { slug: string }) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <Notice title="The card database isn't connected">
        This build has no Convex deployment configured.
      </Notice>
    );
  }
  return <ConnectedSet slug={slug} />;
}

function ConnectedSet({ slug }: { slug: string }) {
  const result = useQuery(api.cards.setCards, { slug });
  if (result === undefined) return <p className="text-sm text-muted-foreground">Loading set…</p>;
  if (result === null) {
    return <Notice title="Set not found">There is no set at this address in the database.</Notice>;
  }

  const { set, cards, fromOtherSets, don } = result;
  const total = cards.length + fromOtherSets.length + don.length;
  const released = releaseLabel(set, "day");
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
          {SET_KIND_LABEL[set.kind]} · {total} card{total === 1 ? "" : "s"}
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
          <h2 className="text-lg font-semibold">From other sets</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cards first printed elsewhere that this set also includes, such as SP cards and reprints.
          </p>
          <CardGrid cards={fromOtherSets} />
        </section>
      )}
      {don.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">DON!! cards</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            DON!! cards that come with this set. They have no card number, so they sit apart from the list above.
          </p>
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
