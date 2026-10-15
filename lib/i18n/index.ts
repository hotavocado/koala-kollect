import { notFound } from "next/navigation";
import { lang as rootLang } from "next/root-params";
import en, { type Dict } from "./en";
import fr from "./fr";
import ja from "./ja";
import ko from "./ko";
import { type Plural, fill, plural } from "./format";
import { LOCALE_TAG, type Locale, isLocale, localePath } from "./locales";
import zh from "./zh";

export const DICTIONARIES: Record<Locale, Dict> = { en, ja, zh, ko, fr };

export type I18n = {
  lang: Locale;
  // The BCP 47 tag, for Intl and toLocale* calls.
  tag: string;
  t: Dict;
  href: (path: string) => string;
  plural: (entry: Plural, n: number, vars?: Record<string, string | number>) => string;
  fill: typeof fill;
};

export function i18nFor(lang: Locale): I18n {
  return {
    lang,
    tag: LOCALE_TAG[lang],
    t: DICTIONARIES[lang],
    href: (path) => localePath(lang, path),
    plural: (entry, n, vars) => plural(lang, entry, n, vars),
    fill,
  };
}

// The current request's language, for Server Components anywhere below the
// root layout. An unknown first segment is a 404, not English.
export async function getI18n(): Promise<I18n> {
  const lang = await rootLang();
  if (!isLocale(lang)) notFound();
  return i18nFor(lang);
}
