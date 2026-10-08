import Link from "next/link";

// The page a QR code on a Minokoala card lands on, so it answers three things
// in order: what this is, the art, and the way into the cards.
export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container flex h-16 items-center">
        <span className="font-heading text-lg font-semibold">Koala Kollect</span>
      </header>

      <main className="container flex flex-1 flex-col gap-8 pb-12 pt-4 xs:pt-10">
        <h1 className="max-w-2xl text-3xl font-semibold xs:text-5xl">
          Every One Piece card ever printed, and where each one came from.
        </h1>

        <ArtSlot />

        <div className="flex flex-col gap-3">
          <Link
            href="/cards"
            className="inline-flex h-12 w-full items-center justify-center rounded-pill bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 xs:w-auto xs:self-start"
          >
            Browse the cards
          </Link>
          <p className="max-w-xl text-sm text-muted-foreground">
            English, Japanese and Chinese printings, read from the official card lists. Free and
            open source.
          </p>
        </div>
      </main>

      <footer className="container pb-8 text-xs text-muted-foreground">
        <p>
          Fan-made and not affiliated with Bandai. Card images link to their official sources.{" "}
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href="https://github.com/hotavocado/koala-kollect"
          >
            Source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

// Holds the space for the mascot art (Minokoala, with Koala and Sabo) until
// Mike's files arrive. Swap the inner placeholder for the image and keep the
// frame, so the layout does not move when the art lands. Original art only:
// nothing from the show goes in this slot.
function ArtSlot() {
  return (
    <figure
      aria-label="Koala Kollect art, coming soon"
      className="relative aspect-[4/3] w-full max-w-2xl overflow-hidden rounded-lg bg-layer-2"
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <span
          aria-hidden
          className="flex size-16 items-center justify-center rounded-lg bg-primary font-heading text-xl font-semibold text-primary-foreground"
        >
          KK
        </span>
        <span className="text-xs">Art coming soon</span>
      </div>
    </figure>
  );
}
