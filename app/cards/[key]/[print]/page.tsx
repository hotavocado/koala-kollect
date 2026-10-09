import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PrintDetailView } from "./print-detail";
import { ImageCredit } from "../../ui";

export const metadata: Metadata = {
  title: "Printing · Koala Kollect",
  description: "One printing of a One Piece Card Game card: its own image and where it came from.",
};

// Same shape as the card page: a static header, the keys read inside Suspense.
export default function PrintPage({ params }: { params: Promise<{ key: string; print: string }> }) {
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
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading printing…</p>}>
          {params.then(({ key, print }) => (
            <PrintDetailView cardKey={key} printKey={print} />
          ))}
        </Suspense>
      </main>
      <ImageCredit />
    </div>
  );
}
