"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Dict } from "./en";
import { fill, plural } from "./format";
import { LOCALE_TAG, type Locale, localePath } from "./locales";

// Client Components read the language the root layout resolved. The layout
// passes this language's dictionary only, as plain data.
const I18nContext = createContext<{ lang: Locale; t: Dict } | null>(null);

export function I18nProvider({ lang, t, children }: { lang: Locale; t: Dict; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t }), [lang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Memoised on the language, so href and plural are stable across renders and
// safe in an effect's dependencies.
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  const { lang, t } = ctx;
  return useMemo(
    () => ({
      lang,
      tag: LOCALE_TAG[lang],
      t,
      href: (path: string) => localePath(lang, path),
      plural: (entry: Parameters<typeof plural>[1], n: number, vars?: Record<string, string | number>) =>
        plural(lang, entry, n, vars),
      fill,
    }),
    [lang, t],
  );
}
