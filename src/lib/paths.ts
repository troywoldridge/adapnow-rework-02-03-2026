// src/lib/paths.ts
// Centralized, public-facing route constants

function normalizePath(p: string) {
  if (!p.startsWith("/")) p = `/${p}`;
  if (p !== "/" && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

export const CATEGORIES_PATH = normalizePath(
  process.env.NEXT_PUBLIC_CATEGORIES_PATH || "/category",
);
