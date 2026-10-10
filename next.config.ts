import type { NextConfig } from "next";
import { CARD_IMAGE_QUALITY, CARD_IMAGE_WIDTHS } from "./app/cards/image";
import { MINOKOALA } from "./app/minokoala";

const widths = [...Object.values(CARD_IMAGE_WIDTHS), MINOKOALA.derivative].sort((a, b) => a - b);

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Only our card-image proxy and the homepage Minokoala (app/minokoala.ts) are
  // optimized, only at the widths CardImage and the homepage ask for. A source
  // url's bytes never change, so the cache can hold for a year.
  images: {
    localPatterns: [{ pathname: "/api/card-image/**", search: "" }],
    remotePatterns: [
      { protocol: "https", hostname: MINOKOALA.host, pathname: MINOKOALA.pathname, search: MINOKOALA.search },
    ],
    deviceSizes: [widths[widths.length - 1]],
    imageSizes: widths.slice(0, -1),
    qualities: [CARD_IMAGE_QUALITY],
    formats: ["image/webp"],
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;
