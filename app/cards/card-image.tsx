"use client";

import { useState } from "react";
import { proxiedImageUrl } from "./image";

// The card's official image through our own origin, or the text face when
// there is none or it fails to load.
export function CardImage({
  imageUrl,
  alt,
  className,
  fallback,
}: {
  imageUrl: string | null;
  alt: string;
  className: string;
  fallback: React.ReactNode;
}) {
  const src = proxiedImageUrl(imageUrl);
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return fallback;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served by our own route, already cached at the CDN
    <img src={src} alt={alt} loading="lazy" decoding="async" className={className} onError={() => setFailed(src)} />
  );
}
