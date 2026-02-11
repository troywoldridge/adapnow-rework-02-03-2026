// src/lib/algolia.ts
import "server-only";

import algoliasearch, { type SearchClient } from "algoliasearch/lite";

export type AlgoliaClientResult =
  | { client: SearchClient; indexName: string }
  | { client: null; indexName: "" };

function readEnv(key: string): string {
  const v = (process.env as Record<string, string | undefined>)[key];
  return String(v ?? "").trim();
}

function devWarnMissing(missing: string[], present: Record<string, boolean>) {
  if (process.env.NODE_ENV === "production") return;
  // Keep logs useful but not noisy.
  console.warn("[algolia] missing env vars:", missing.join(", "), present);
}

/**
 * Returns the Algolia SearchClient + indexName when configured.
 * Otherwise returns `{ client: null, indexName: "" }`.
 *
 * Note: Uses NEXT_PUBLIC_* env vars so it can be used in client components.
 */
export function getAlgoliaClient(): AlgoliaClientResult {
  const appId = readEnv("NEXT_PUBLIC_ALGOLIA_APP_ID");
  const searchKey = readEnv("NEXT_PUBLIC_ALGOLIA_SEARCH_KEY");
  const indexName = readEnv("NEXT_PUBLIC_ALGOLIA_INDEX_NAME");

  const missing: string[] = [];
  if (!appId) missing.push("NEXT_PUBLIC_ALGOLIA_APP_ID");
  if (!searchKey) missing.push("NEXT_PUBLIC_ALGOLIA_SEARCH_KEY");
  if (!indexName) missing.push("NEXT_PUBLIC_ALGOLIA_INDEX_NAME");

  if (missing.length) {
    devWarnMissing(missing, {
      appId: !!appId,
      searchKey: !!searchKey,
      indexName: !!indexName,
    });

    return Object.freeze({ client: null, indexName: "" });
  }

  const client = algoliasearch(appId, searchKey);
  return Object.freeze({ client, indexName });
}
