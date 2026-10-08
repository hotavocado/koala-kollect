import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardDetailView } from "./card-detail";
import { ImageCredit } from "../ui";

export const metadata: Metadata = {
  title: "Card · Koala Kollect",
  description: "A One Piece Card Game card, every printing of it, and where each one came from.",
};

// The header is static. The key is request data under cacheComponents (there
// is no generateStaticParams: the card list lives in Convex, not the build),
// so reading it sits inside a Suspense boundary.
export default function CardPage({ params }: { params: Promise<{ key: string }> }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container flex h-16 items-center gap-4">
        <Link href="/" className="font-heading text-lg font-semibold">
          Koala Kollect
        </Link>
        <Link href="/cards" className="text-sm text-muted-foreground hover:text-foreground">
          Cards
        </Link>
      </header>
      <main className="container flex-1 pb-12 pt-4">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading card…</p>}>
          {params.then(({ key }) => (
            <CardDetailView cardKey={key} />
          ))}
        </Suspense>
      </main>
      <ImageCredit />
    </div>
  );
}
