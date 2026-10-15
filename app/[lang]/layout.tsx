import type { Metadata } from "next";
import "@fontsource/plus-jakarta-sans/300.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "../../styles/colors.scss";
import "../globals.css";
import { getI18n } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/client";
import { LOCALES, SITE_ORIGIN } from "@/lib/i18n/locales";
import { Providers } from "../providers";

// One prerendered shell per language; the language is the root param.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: t.meta.homeTitle,
    description: t.meta.homeDescription,
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { lang, tag, t } = await getI18n();
  return (
    <html lang={tag} suppressHydrationWarning>
      <body>
        <Providers>
          <I18nProvider lang={lang} t={t}>
            {children}
          </I18nProvider>
        </Providers>
      </body>
    </html>
  );
}
