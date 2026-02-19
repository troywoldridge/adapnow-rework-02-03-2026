// src/lib/artwork/artworkThumb.ts
// Client-safe helper for a thumbnail URL.
// We keep artwork private; thumbnails should be served by a server route that verifies auth.

export function cartArtworkThumbUrl(params: { cartLineId: string; side?: number; v?: string }): string {
  const side = Number.isFinite(params.side as number) ? Number(params.side) : 1;
  const v = (params.v ?? "").trim();
  const qs = new URLSearchParams({ side: String(side) });
  if (v) qs.set("v", v);
  return `/api/cart/lines/${encodeURIComponent(params.cartLineId)}/artwork/thumb?${qs.toString()}`;
}
