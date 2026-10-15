import { type NextRequest, NextResponse } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, isLocale, negotiate, splitLocale } from "./lib/i18n/locales";
import { setSlugFor } from "./lib/set-slug";

const YEAR = 60 * 60 * 24 * 365;

// Every page lives under app/[lang]. English is served at bare paths by a
// rewrite, so the URLs the site had before languages keep working. A bare URL
// goes to another language only when the visitor chose one (the cookie) or,
// with no choice yet, their browser asks for one (Accept-Language). Visiting a
// prefixed URL records that language as the choice, which is how the toggle
// works: it links to /<lang>/<path>, English included.
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const moved = movedSetPath(url.pathname);
  if (moved) {
    url.pathname = moved;
    return NextResponse.redirect(url, 308);
  }
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

// Set pages were once one per product code. Since sets join across languages,
// cn's OPC-09 page is OP-09's and en's combined OP14-EB04 is OP-14's, so an
// old URL moves there for good, with its language prefix kept.
export function movedSetPath(pathname: string): string | null {
  const m = /^(.*\/cards\/set\/)([^/]+)$/.exec(pathname);
  if (!m) return null;
  const slug = setSlugFor(m[2]);
  return slug === m[2] ? null : `${m[1]}${slug}`;
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
