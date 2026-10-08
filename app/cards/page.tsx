import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardFinder } from "./card-finder";
import { ImageCredit } from "./ui";

export const metadata: Metadata = {
  title: "Cards · Koala Kollect",
  description:
    "Find any One Piece Card Game card by number or name, or browse every set, starter deck and promotion in the Koala Kollect database.",
};

export default function CardsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container flex h-16 items-center">
        <Link href="/" className="font-heading text-lg font-semibold">
          Koala Kollect
        </Link>
      </header>
      <main className="container flex-1 pb-12 pt-4">
        <h1 className="text-3xl font-semibold">Cards</h1>
        <div className="mt-6">
          {/* CardFinder reads ?q=, so it renders on the client; the box holds its place meanwhile. */}
          <Suspense fallback={<div className="h-12 rounded-lg border border-input bg-layer-1" />}>
            <CardFinder />
          </Suspense>
        </div>
      </main>
      <ImageCredit />
    </div>
  );
}
