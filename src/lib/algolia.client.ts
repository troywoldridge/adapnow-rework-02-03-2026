import algoliasearch from "algoliasearch/lite";
import type { SearchClient } from "algoliasearch/lite";

export type AlgoliaClientResult =
  | { client: SearchClient; indexName: string }
  | { client: null; indexName: "" };

function readEnv(key: string): string {
  const v = (process.env as Record<string, string | undefined>)[key];
  return String(v ?? "").trim();
}

export function getAlgoliaClient(): AlgoliaClientResult {
  const appId = readEnv("NEXT_PUBLIC_ALGOLIA_APP_ID");
  const searchKey = readEnv("NEXT_PUBLIC_ALGOLIA_SEARCH_KEY");
  const indexName = readEnv("NEXT_PUBLIC_ALGOLIA_INDEX_NAME");

  if (!appId || !searchKey || !indexName) {
    return { client: null, indexName: "" };
  }

  return { client: algoliasearch(appId, searchKey), indexName };
}
