// src/types/image.ts

/**
 * Cloudflare Images / CDN-friendly image references.
 * Keep this shape light and stable; DB/image tables can map into this.
 */

export interface ImageAsset {
  id: string;

  /** Cloudflare Images ID (imagedelivery.net/<account>/<imageId>/<variant>) */
  imageId: string;

  alt?: string | null;
  variant?: string | null;

  /** Optional prebuilt URL if you store it */
  url?: string | null;

  [k: string]: unknown;
}
