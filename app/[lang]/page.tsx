import Image from "next/image";
import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { MINOKOALA } from "../minokoala";
import { Alternates } from "./_site/alternates";
import { SiteHeader } from "./_site/site-header";

// The page a QR code on a Minokoala card lands on, so it answers three things
// in order: what this is, the art, and the way into the cards.
export default async function Home() {
  const { t, href } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <Alternates path="/" />
      <SiteHeader home />

      <main className="container flex flex-1 flex-col gap-8 pb-12 pt-4 xs:pt-10">
        <h1 className="max-w-2xl text-3xl font-semibold xs:text-5xl">
          {t.home.headline}
        </h1>

        <ArtSlot alt={t.home.artAlt} />

        <div className="flex flex-col gap-3">
          <Link
            href={href("/cards")}
            className="inline-flex h-12 w-full items-center justify-center rounded-pill bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 xs:w-auto xs:self-start"
          >
            {t.home.browse}
          </Link>
          <p className="max-w-xl text-sm text-muted-foreground">
            {t.home.tagline}
          </p>
        </div>
      </main>

      <footer className="container pb-8 text-xs text-muted-foreground">
        <p>
          {t.home.disclaimer}{" "}
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href="https://github.com/hotavocado/koala-kollect"
          >
            {t.home.source}
          </a>
        </p>
      </footer>
    </div>
  );
}

// Minokoala, served from the wiki through the optimizer (app/minokoala.ts).
// The credit stays in fine print under the art.
function ArtSlot({ alt }: { alt: string }) {
  return (
    <figure className="flex w-full max-w-[420px] flex-col gap-2">
      <Image
        src={MINOKOALA.src}
        alt={alt}
        width={MINOKOALA.width}
        height={MINOKOALA.height}
        priority
        className="h-auto w-full rounded-lg bg-layer-2"
      />
      <figcaption className="text-[11px] leading-snug text-muted-foreground">
        Minokoala © Eiichiro Oda/Shueisha, Toei Animation
      </figcaption>
    </figure>
  );
}
