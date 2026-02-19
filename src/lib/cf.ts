// src/lib/cf.ts

export function cfUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_CDN_BASE_URL || "";
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
