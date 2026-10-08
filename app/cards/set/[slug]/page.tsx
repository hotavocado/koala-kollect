import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SetCardsView } from "./set-cards";
import { ImageCredit } from "../../ui";

export const metadata: Metadata = {
  title: "Set · Koala Kollect",
  description: "Every card in one One Piece Card Game set, in card-number order.",
};

// Same shape as the card page: a static header, and the slug read inside a
// Suspense boundary because it is request data under cacheComponents.
export default function SetPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container flex h-16 items-center gap-4">
        <Link href="/" className="font-heading text-lg font-semibold">
          Koala Kollect
        </Link>
        <Link href="/cards" className="text-sm text-muted-foreground hover:text-foreground">
          Sets
        </Link>
      </header>
      <main className="container flex-1 pb-12 pt-4">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading set…</p>}>
          {params.then(({ slug }) => (
            <SetCardsView slug={slug} />
          ))}
        </Suspense>
      </main>
      <ImageCredit />
    </div>
  );
}
