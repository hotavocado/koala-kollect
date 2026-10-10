import type { NextConfig } from "next";
import { CARD_IMAGE_QUALITY, CARD_IMAGE_WIDTHS } from "./app/cards/image";

const widths = Object.values(CARD_IMAGE_WIDTHS).sort((a, b) => a - b);

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Only our card-image proxy is optimized, only at the widths CardImage asks
  // for (app/cards/image.ts). A source url's bytes never change, so the cache
  // can hold for a year.
  images: {
    localPatterns: [{ pathname: "/api/card-image/**", search: "" }],
    remotePatterns: [],
    deviceSizes: [widths[widths.length - 1]],
    imageSizes: widths.slice(0, -1),
    qualities: [CARD_IMAGE_QUALITY],
    formats: ["image/webp"],
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;
