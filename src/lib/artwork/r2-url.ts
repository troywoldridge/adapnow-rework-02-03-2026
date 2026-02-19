// src/lib/artwork/r2-url.ts
// Client-safe "private access" URLs (served by your app, not R2).

export function artworkDownloadRoute(key: string): string {
  return `/api/artwork/download?key=${encodeURIComponent(String(key || ""))}`;
}

export function artworkThumbRoute(key: string): string {
  return `/api/artwork/thumb?key=${encodeURIComponent(String(key || ""))}`;
}
