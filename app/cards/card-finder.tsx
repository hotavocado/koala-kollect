"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { SearchHit, SearchResult } from "@/convex/cardSearch";
import { SEARCH_LIMIT } from "@/convex/cardSearchCore";
import { CardImage } from "./card-image";
import { SetIndex } from "./set-index";
import { cardLabel, ColorDots } from "./ui";

// How long typing has to pause before the query runs and the URL updates.
const DEBOUNCE_MS = 200;

// The cards index: a search box over the set list. With a query, the results
// replace the sets; cleared, the sets come back. The query lives in ?q= so a
// search survives the back button and can be shared.
export function CardFinder() {
  // Same guard as SetIndex: the Convex hooks throw without a deployment.
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return <SetIndex />;
  return <ConnectedFinder />;
}

function ConnectedFinder() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(() => params.get("q") ?? "");
  const [term, setTerm] = useState(() => (params.get("q") ?? "").trim());

  useEffect(() => {
    const next = value.trim();
    if (next === term) return;
    const id = setTimeout(() => {
      setTerm(next);
      router.replace(next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname, { scroll: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value, term, pathname, router]);

  const live = useQuery(api.cardSearch.search, term ? { q: term } : "skip");
  // Keep the last answer on screen while the next one loads, so the list
  // doesn't blink empty on every keystroke.
  const [shown, setShown] = useState<SearchResult | undefined>(undefined);
  if (live !== undefined && live !== shown) setShown(live);

  // Enter opens the top result, the way a typed card number should. Pressed
  // before the pause, it runs the query now and opens the result when it
  // lands. Holds the term Enter asked to open; a ref because it never renders.
  const openOnArrival = useRef<string | null>(null);
  useEffect(() => {
    if (openOnArrival.current === null || openOnArrival.current !== term || live === undefined) return;
    openOnArrival.current = null;
    const top = live.hits[0];
    if (top) router.push(`/cards/${top.key}`);
  }, [term, live, router]);

  const listId = useId();
  return (
    <div className="flex flex-col gap-6">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const next = value.trim();
          if (!next) return;
          if (next === term && live !== undefined) {
            const top = live.hits[0];
            if (top) router.push(`/cards/${top.key}`);
            return;
          }
          openOnArrival.current = next;
          if (next !== term) {
            setTerm(next);
            router.replace(`${pathname}?q=${encodeURIComponent(next)}`, { scroll: false });
          }
        }}
      >
        <label htmlFor={`${listId}-q`} className="sr-only">
          Find a card by number or name
        </label>
        <input
          id={`${listId}-q`}
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Card number or name, e.g. OP01-001 or Nami"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-controls={term ? listId : undefined}
          className="h-12 w-full rounded-lg border border-input bg-layer-1 px-4 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </form>
      {term ? <Results id={listId} term={term} result={shown} /> : <SetIndex />}
    </div>
  );
}

function Results({ id, term, result }: { id: string; term: string; result: SearchResult | undefined }) {
  if (result === undefined) return <p className="text-sm text-muted-foreground">Searching…</p>;
  if (result.hits.length === 0) {
    return (
      <p id={id} className="text-sm text-muted-foreground" aria-live="polite">
        No card matches “{term}”. Try a card number like OP01-001 or P-034, or part of a name.
      </p>
    );
  }
  return (
    <section aria-live="polite">
      <h2 className="sr-only">Search results</h2>
      <ul id={id} className="flex flex-col gap-2">
        {result.hits.map((hit) => (
          <li key={hit.key}>
            <ResultRow hit={hit} />
          </li>
        ))}
      </ul>
      {result.hits.length >= SEARCH_LIMIT && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the first {result.hits.length}. Type more of the number or name to narrow it.
        </p>
      )}
    </section>
  );
}

function ResultRow({ hit }: { hit: SearchHit }) {
  const label = cardLabel(hit);
  return (
    <Link
      href={`/cards/${hit.key}`}
      className="flex items-center gap-3 rounded-lg bg-layer-1 p-2 pr-4 transition-colors hover:bg-layer-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <CardImage
        imageUrl={hit.imageUrl}
        alt=""
        className="aspect-[63/88] w-12 shrink-0 rounded bg-layer-2 object-cover"
        fallback={<span className="aspect-[63/88] w-12 shrink-0 rounded bg-layer-2" />}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {hit.matchedName && (
          <span className="block truncate text-xs text-muted-foreground">
            {hit.matchedName}
          </span>
        )}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <ColorDots colors={hit.colors} />
          <span className="whitespace-nowrap">
            {hit.printings} printing{hit.printings === 1 ? "" : "s"}
          </span>
        </span>
      </span>
      {hit.number && (
        <span className="shrink-0 rounded-pill bg-layer-2 px-2.5 py-1 text-xs font-medium tabular-nums">
          {hit.number}
        </span>
      )}
    </Link>
  );
}
