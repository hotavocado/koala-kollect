"use client";

import { useState } from "react";
import { type CardImageSize, cardImageSrc } from "./image";

// The card's official image through our own origin, or the text face when
// there is none or it fails to load. With a size, the image comes resized by
// Vercel's optimizer; if that request fails the full image is tried straight
// from the proxy, and only then the text face, so an optimizer outage costs
// bytes, never the picture. Without a size (the large image on a card page)
// the full image is served as before.
export function CardImage({
  imageUrl,
  size,
  alt,
  className,
  fallback,
}: {
  imageUrl: string | null;
  size?: CardImageSize;
  alt: string;
  className: string;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const src = cardImageSrc(imageUrl, size, failed);
  if (!src) return fallback;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- one optimizer width per surface, built in ./image
    <img
      key={src}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setFailed((f) => new Set(f).add(src))}
    />
  );
}
