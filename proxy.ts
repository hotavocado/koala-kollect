import { type NextRequest, NextResponse } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, isLocale, negotiate, splitLocale } from "./lib/i18n/locales";

const YEAR = 60 * 60 * 24 * 365;

// Every page lives under app/[lang]. English is served at bare paths by a
// rewrite, so the URLs the site had before languages keep working. A bare URL
// goes to another language only when the visitor chose one (the cookie) or,
// with no choice yet, their browser asks for one (Accept-Language). Visiting a
// prefixed URL records that language as the choice, which is how the toggle
// works: it links to /<lang>/<path>, English included.
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const { lang, path } = splitLocale(url.pathname);

  if (lang === DEFAULT_LOCALE) {
    url.pathname = path;
    return remember(request, NextResponse.redirect(url), lang);
  }
  if (lang) return remember(request, NextResponse.next(), lang);

  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const chosen = cookie && isLocale(cookie) ? cookie : (negotiate(request.headers.get("accept-language")) ?? DEFAULT_LOCALE);
  url.pathname = `/${chosen}${path === "/" ? "" : path}`;
  return chosen === DEFAULT_LOCALE ? NextResponse.rewrite(url) : NextResponse.redirect(url);
}

function remember(request: NextRequest, response: NextResponse, lang: Locale) {
  if (request.cookies.get(LOCALE_COOKIE)?.value !== lang) {
    response.cookies.set(LOCALE_COOKIE, lang, { path: "/", maxAge: YEAR, sameSite: "lax" });
  }
  return response;
}

export const config = {
  // Not the image proxy, Next's own files, or anything with an extension.
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
