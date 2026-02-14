// src/lib/lru.ts
import "server-only";

/**
 * Tiny in-memory LRU-ish cache with TTL.
 * Intended for lightweight server runtime caching (option maps, small lookups).
 *
 * Notes:
 * - This is per-process memory. In serverless it may not persist between invocations.
 * - "LRU-ish": we track last access time and evict the oldest by at.
 */

export type LruOptions = {
  /** Maximum entries kept in memory */
  max?: number;
  /** Default TTL in ms */
  ttlMs?: number;
  /** Cleanup interval (every N operations) */
  cleanupEvery?: number;
};

type Entry<T> = { v: T; at: number; ttlMs: number };

const DEFAULTS: Required<LruOptions> = {
  max: 200,
  ttlMs: 1000 * 60 * 30, // 30 min
  cleanupEvery: 50,
};

// Single shared cache map (small + intentional)
const CACHE = new Map<string, Entry<unknown>>();
let ops = 0;

function now() {
  return Date.now();
}

function isExpired(e: Entry<unknown>, t: number): boolean {
  return t - e.at > e.ttlMs;
}

function cleanupExpired(t: number) {
  for (const [k, e] of CACHE.entries()) {
    if (isExpired(e, t)) CACHE.delete(k);
  }
}

function evictOldest() {
  let oldestK: string | undefined;
  let oldestAt = Infinity;

  for (const [k, e] of CACHE.entries()) {
    if (e.at < oldestAt) {
      oldestAt = e.at;
      oldestK = k;
    }
  }

  if (oldestK) CACHE.delete(oldestK);
}

function maybeCleanup(opts: Required<LruOptions>) {
  ops += 1;
  if (ops % opts.cleanupEvery === 0) cleanupExpired(now());
}

function normalizeOpts(opts?: LruOptions): Required<LruOptions> {
  return {
    max: typeof opts?.max === "number" && opts.max > 0 ? Math.floor(opts.max) : DEFAULTS.max,
    ttlMs: typeof opts?.ttlMs === "number" && opts.ttlMs > 0 ? Math.floor(opts.ttlMs) : DEFAULTS.ttlMs,
    cleanupEvery:
      typeof opts?.cleanupEvery === "number" && opts.cleanupEvery > 0
        ? Math.floor(opts.cleanupEvery)
        : DEFAULTS.cleanupEvery,
  };
}

/**
 * Get a value from cache.
 * Returns undefined if missing or expired.
 */
export function lruGet<T>(k: string, opts?: LruOptions): T | undefined {
  const o = normalizeOpts(opts);
  maybeCleanup(o);

  const key = String(k);
  const e = CACHE.get(key);
  if (!e) return undefined;

  const t = now();
  if (isExpired(e, t)) {
    CACHE.delete(key);
    return undefined;
  }

  // Touch
  e.at = t;
  return e.v as T;
}

/**
 * Set a value in cache.
 * Optionally override TTL for this entry via ttlMs param.
 */
export function lruSet<T>(k: string, v: T, ttlMs?: number, opts?: LruOptions): void {
  const o = normalizeOpts(opts);
  maybeCleanup(o);

  const key = String(k);
  const ttl =
    typeof ttlMs === "number" && ttlMs > 0 ? Math.floor(ttlMs) : o.ttlMs;

  if (CACHE.size >= o.max && !CACHE.has(key)) {
    evictOldest();
  }

  CACHE.set(key, { v, at: now(), ttlMs: ttl });
}

/**
 * Check whether key exists and is not expired.
 */
export function lruHas(k: string, opts?: LruOptions): boolean {
  return lruGet(k, opts) !== undefined;
}

/**
 * Delete a key.
 */
export function lruDelete(k: string): void {
  CACHE.delete(String(k));
}

/**
 * Clear cache.
 */
export function lruClear(): void {
  CACHE.clear();
}

/**
 * Current cache size (includes unexpired entries; expired cleanup is opportunistic).
 */
export function lruSize(): number {
  return CACHE.size;
}
