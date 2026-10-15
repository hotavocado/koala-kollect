import { LOCALE_TAG, type Locale } from "./locales";

// A string that varies with a count, one form per CLDR plural category the
// language uses. Japanese, Chinese and Korean use `other` alone.
export type Plural = { other: string; zero?: string; one?: string; two?: string; few?: string; many?: string };

// Fills {name} slots. A slot with no value is left as written, so a missing
// variable shows on the page instead of silently reading "undefined".
export function fill(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (slot, name: string) => (name in vars ? String(vars[name]) : slot));
}

// Picks the plural form for `n` in `lang` and fills it; {n} is the number
// formatted for the language.
export function plural(lang: Locale, entry: Plural, n: number, vars: Record<string, string | number> = {}): string {
  const tag = LOCALE_TAG[lang];
  const form = entry[new Intl.PluralRules(tag).select(n) as keyof Plural] ?? entry.other;
  return fill(form, { n: n.toLocaleString(tag), ...vars });
}
