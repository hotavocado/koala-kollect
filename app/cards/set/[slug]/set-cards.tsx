"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CardTile } from "../../card-tile";
import { Notice, SET_KIND_HEADING } from "../../ui";

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

  const { set, cards } = result;
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
          {SET_KIND_HEADING[set.kind]} · {cards.length} card{cards.length === 1 ? "" : "s"}
        </span>
      </p>
      <ul className="mt-6 grid grid-cols-2 gap-4 xs:grid-cols-4 lg:grid-cols-6">
        {cards.map((card) => (
          <li key={card.key}>
            <CardTile card={card} />
          </li>
        ))}
      </ul>
    </>
  );
}
