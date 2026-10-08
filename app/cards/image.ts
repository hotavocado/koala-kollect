// The official card images are served from our own origin. The image hosts
// send Cross-Origin-Resource-Policy: same-site, so a browser refuses them on
// any other site; fetched server-side, the header does not apply.
//
// Only card images on the four official hosts pass, so the route is not an
// open proxy. Every printing in the data uses exactly this pattern (measured
// 2026-10-08: 19,669 rows, four hosts, one path, .png, no query).

const HOSTS = {
  www: "www.onepiece-cardgame.com",
  en: "en.onepiece-cardgame.com",
  "asia-en": "asia-en.onepiece-cardgame.com",
  "asia-tc": "asia-tc.onepiece-cardgame.com",
} as const;

const PATH = "/images/cardlist/card/";
const FILE = /^[A-Za-z0-9_-]+\.png$/;

// Official image URL -> our path, or null when it is not an official card image.
export function proxiedImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.search || url.hash || url.port) return null;
  const host = (Object.keys(HOSTS) as (keyof typeof HOSTS)[]).find((k) => HOSTS[k] === url.hostname);
  if (!host || !url.pathname.startsWith(PATH)) return null;
  const file = url.pathname.slice(PATH.length);
  if (!FILE.test(file)) return null;
  return `/api/card-image/${host}/${file}`;
}

// Our path's parts -> the official URL to fetch, or null to refuse.
export function upstreamImageUrl(host: string, file: string): string | null {
  if (!Object.hasOwn(HOSTS, host) || !FILE.test(file)) return null;
  return `https://${HOSTS[host as keyof typeof HOSTS]}${PATH}${file}`;
}
