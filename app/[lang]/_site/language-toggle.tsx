"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES, LOCALE_TAG, NATIVE_NAME, splitLocale, switchPath } from "@/lib/i18n/locales";

// Each language links to this page in that language (switchPath). Plain
// links, not client navigation, because the root layout (html lang) changes.
export function LanguageToggle() {
  const { lang, t } = useI18n();
  const { path } = splitLocale(usePathname());
  const search = useSearchParams().toString();
  return (
    <details className="relative">
      <summary
        aria-label={t.site.language}
        className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground"
      >
        {NATIVE_NAME[lang]}
      </summary>
      <ul className="absolute right-0 z-10 mt-2 min-w-36 rounded-lg bg-layer-1 p-1 shadow-lg">
        {LOCALES.map((l) => (
          <li key={l}>
            <a
              href={switchPath(l, path, search)}
              hrefLang={LOCALE_TAG[l]}
              lang={LOCALE_TAG[l]}
              aria-current={l === lang ? "true" : undefined}
              className="block rounded px-3 py-2 text-sm hover:bg-layer-2 aria-[current]:font-semibold"
            >
              {NATIVE_NAME[l]}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
