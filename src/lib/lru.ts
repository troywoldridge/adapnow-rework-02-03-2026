// src/lib/lru.ts
/**
 * Tiny LRU-ish cache with TTL.
 * - Good for small server-only memoization (option maps, etc.)
 * - NOT distributed; per-process only.
 *
 * Notes:
 * - Access bumps recency.
 * - Eviction removes oldest `at` (least recently touched).
 */

type Entry<T> = { v: T; at: number };

const CACHE = new Map<string, Entry<unknown>>();

const MAX = 200; // keep it small
const TTL_MS = 1000 * 60 * 30; // 30 min

function now() {
  return Date.now();
}

export function lruGet<T>(k: string): T | undefined {
  const e = CACHE.get(k);
  if (!e) return undefined;

  if (now() - e.at > TTL_MS) {
    CACHE.delete(k);
    return undefined;
  }

  // bump recency
  e.at = now();
  return e.v as T;
}

export function lruSet<T>(k: string, v: T): void {
  // If key exists, update and bump recency without evicting.
  const existing = CACHE.get(k);
  if (existing) {
    existing.v = v as unknown;
    existing.at = now();
    return;
  }

  if (CACHE.size >= MAX) {
    // delete oldest
    let oldestK: string | undefined;
    let oldestAt = Infinity;

    for (const [key, e] of CACHE.entries()) {
      if (e.at < oldestAt) {
        oldestAt = e.at;
        oldestK = key;
      }
    }

    if (oldestK) CACHE.delete(oldestK);
  }

  CACHE.set(k, { v: v as unknown, at: now() });
}

/** Optional helper if you ever want to clear between tests/dev reloads. */
export function lruClear(): void {
  CACHE.clear();
}
