import { upstreamImageUrl } from "@/app/cards/image";

const USER_AGENT = "koala-kollect (+https://github.com/hotavocado/koala-kollect)";

// A week in the browser, a year at the CDN. An image id is stable per
// printing, but nothing promises the bytes never change, so the browser copy
// is not immutable; a CDN purge reaches every viewer within a week.
const CACHE_OK = "public, max-age=604800, s-maxage=31536000";
const CACHE_MISS = "public, max-age=3600";

export async function GET(_req: Request, { params }: { params: Promise<{ host: string; file: string }> }) {
  const { host, file } = await params;
  const upstream = upstreamImageUrl(host, file);
  if (!upstream) return new Response(null, { status: 404 });

  let res: Response;
  try {
    res = await fetch(upstream, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
  } catch {
    return new Response(null, { status: 502 });
  }
  const type = res.headers.get("content-type") ?? "";
  // A missing id answers 404 text/html; anything that is not an image is a miss.
  if (!res.ok || !type.startsWith("image/")) {
    return new Response(null, { status: 404, headers: { "Cache-Control": CACHE_MISS } });
  }
  const headers = new Headers({ "Content-Type": type, "Cache-Control": CACHE_OK, "X-Content-Type-Options": "nosniff" });
  const length = res.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(res.body, { headers });
}
