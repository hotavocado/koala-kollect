// The official card images are served from our own origin. The image hosts
// send Cross-Origin-Resource-Policy: same-site, so a browser refuses them on
// any other site; fetched server-side, the header does not apply.
//
// Only card images on the four official hosts pass, so the route is not an
// open proxy. Every printing in the data uses exactly this pattern (measured
// 2026-10-08: 19,669 rows, four hosts, one path, .png, no query).
//
// tcgcsv prints (stamped, DON) have only TCGplayer's image, so its CDN passes
// too. Measured 2026-10-10 over data main 0ceb11c: 783 of 862 tcgcsv rows
// carry one, all /product/<id>_in_1000x1000.jpg, no query; 79 carry none.
//
// cn's images are on Windo's host, which allows cross-origin loads, but they
// come through here too so every card image takes one path. Measured
// 2026-10-08 over all 4,927 cn rows: one folder, png and jpg, no query, 4,926
// directly under it and one (id 7045) a 32-hex folder deeper. File names carry
// URL-encoded copy marks, Chinese and a space, so cn's rule is on the decoded
// name, and the name is re-encoded the way cn writes it (that round-trips all
// 4,927 exactly).

const HOSTS = {
  www: "www.onepiece-cardgame.com",
  en: "en.onepiece-cardgame.com",
  "asia-en": "asia-en.onepiece-cardgame.com",
  "asia-tc": "asia-tc.onepiece-cardgame.com",
} as const;

const PATH = "/images/cardlist/card/";
const FILE = /^[A-Za-z0-9_-]+\.png$/;

const TCG_HOST = "tcgplayer-cdn.tcgplayer.com";
const TCG_PATH = "/product/";
const TCG_FILE = /^[0-9]+_in_1000x1000\.jpg$/;

const CN_HOST = "source.windoent.com";
const CN_PATH = "/OnePiecePc/Picture/";
const CN_FOLDER = /^[0-9a-f]{32}$/;
// A decoded cn file name: the characters measured in cn's names, never % or /.
const CN_NAME = /^[\p{Script=Han}A-Za-z0-9_()\u2010 -]+(?:\.[A-Za-z0-9_()\u2010 -]+)*\.(?:png|jpg)$/u;

// encodeURIComponent leaves ()!'*~ alone; cn writes ( and ) as %28 and %29.
function cnEncode(name: string): string {
  return encodeURIComponent(name).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// One cn path tail ("name" or "folder/name"), encoded or decoded, -> its
// decoded segments, or null when it is not a cn card image.
function cnSegments(tail: string): string[] | null {
  const parts = tail.split("/");
  if (parts.length > 2) return null;
  let decoded: string[];
  try {
    decoded = parts.map((p) => (/%[0-9A-Fa-f]{2}/.test(p) ? decodeURIComponent(p) : p));
  } catch {
    return null;
  }
  const name = decoded[decoded.length - 1];
  if (!CN_NAME.test(name)) return null;
  if (decoded.length === 2 && !CN_FOLDER.test(decoded[0])) return null;
  return decoded;
}

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
  if (url.hostname === TCG_HOST) {
    const file = url.pathname.startsWith(TCG_PATH) ? url.pathname.slice(TCG_PATH.length) : "";
    return TCG_FILE.test(file) ? `/api/card-image/tcgplayer/${file}` : null;
  }
  if (url.hostname === CN_HOST) {
    if (!url.pathname.startsWith(CN_PATH)) return null;
    const segments = cnSegments(url.pathname.slice(CN_PATH.length));
    return segments && `/api/card-image/cn/${segments.map(cnEncode).join("/")}`;
  }
  const host = (Object.keys(HOSTS) as (keyof typeof HOSTS)[]).find((k) => HOSTS[k] === url.hostname);
  if (!host || !url.pathname.startsWith(PATH)) return null;
  const file = url.pathname.slice(PATH.length);
  if (!FILE.test(file)) return null;
  return `/api/card-image/${host}/${file}`;
}

// Our path's parts -> the official URL to fetch, or null to refuse. file is
// one segment, or for cn a folder and a name joined by "/".
export function upstreamImageUrl(host: string, file: string): string | null {
  if (host === "cn") {
    const segments = cnSegments(file);
    return segments && `https://${CN_HOST}${CN_PATH}${segments.map(cnEncode).join("/")}`;
  }
  if (host === "tcgplayer") return TCG_FILE.test(file) ? `https://${TCG_HOST}${TCG_PATH}${file}` : null;
  if (!Object.hasOwn(HOSTS, host) || !FILE.test(file)) return null;
  return `https://${HOSTS[host as keyof typeof HOSTS]}${PATH}${file}`;
}
