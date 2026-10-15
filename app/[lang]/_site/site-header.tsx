import Link from "next/link";
import { Suspense } from "react";
import { getI18n } from "@/lib/i18n";
import { NATIVE_NAME } from "@/lib/i18n/locales";
import { LanguageToggle } from "./language-toggle";

// The header every page shares: the site name, an optional way back to the
// cards, and the language toggle. A draft translation says so under it.
export async function SiteHeader({ back, home = false }: { back?: "cards" | "sets"; home?: boolean }) {
  const { lang, t, href } = await getI18n();
  return (
    <>
      <header className="container flex h-16 items-center gap-4">
        {home ? (
          <span className="font-heading text-lg font-semibold">{t.site.name}</span>
        ) : (
          <Link href={href("/")} className="font-heading text-lg font-semibold">
            {t.site.name}
          </Link>
        )}
        {back && (
          <Link href={href("/cards")} className="text-sm text-muted-foreground hover:text-foreground">
            {t.site[back]}
          </Link>
        )}
        <div className="ml-auto">
          {/* The toggle reads the pathname, which a prerendered shell does not have. */}
          <Suspense fallback={<span className="text-sm text-muted-foreground">{NATIVE_NAME[lang]}</span>}>
            <LanguageToggle />
          </Suspense>
        </div>
      </header>
      {t.draft && <p className="container -mt-2 pb-2 text-xs text-muted-foreground">{t.site.draftNotice}</p>}
    </>
  );
}
