// src/lib/cloudflare-image.ts
// Back-compat tiny wrapper. Prefer importing from src/lib/cfImages instead.

import { cfImage as _cfImage, type Variant } from "./cfImages";

/**
 * Build a Cloudflare Images delivery URL from an ID or pass-through URL.
 *
 * Defaults to "productTile" (your standard product image variant).
 * Accepts any variant string for compatibility; cfImages will warn if unknown in dev.
 */
export function cfImageUrl(imageIdOrUrl: string, variant?: string): string | null {
  const input = String(imageIdOrUrl ?? "").trim();
  if (!input) return null;

  const v = (String(variant ?? "").trim() || "productTile") as Variant;

  const out = _cfImage(input, v);
  return out || null;
}

export default cfImageUrl;
