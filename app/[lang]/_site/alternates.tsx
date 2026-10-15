import { LOCALES, LOCALE_TAG, SITE_ORIGIN, localePath } from "@/lib/i18n/locales";

// hreflang for one site path. React hoists these <link>s into <head>, so a
// page can render them where it knows its path, even inside Suspense.
export function Alternates({ path }: { path: string }) {
  return (
    <>
      {LOCALES.map((l) => (
        <link key={l} rel="alternate" hrefLang={LOCALE_TAG[l]} href={SITE_ORIGIN + localePath(l, path)} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={SITE_ORIGIN + path} />
    </>
  );
}
