import type { Metadata } from "next";
import Link from "next/link";
import { CardBrowser } from "./card-browser";

export const metadata: Metadata = {
  title: "Cards · Koala Kollect",
  description: "Browse every One Piece Card Game card in the Koala Kollect database.",
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
          <CardBrowser />
        </div>
      </main>
    </div>
  );
}
