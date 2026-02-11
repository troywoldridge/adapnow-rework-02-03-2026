// src/types/algoliasearch-lite.d.ts

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Basic typed subset of Algolia's JS client for "algoliasearch/lite".
 * Keep this minimal and permissive.
 */

declare module "algoliasearch/lite" {
  export type Hit<T = any> = T & {
    objectID: string;
    _highlightResult?: Record<string, any>;
    _snippetResult?: Record<string, any>;
  };

  export interface SearchOptions {
    query?: string;
    hitsPerPage?: number;
    page?: number;
    filters?: string;
    facetFilters?: string[] | string[][];
    attributesToRetrieve?: string[];
    attributesToHighlight?: string[];
    attributesToSnippet?: string[];
    highlightPreTag?: string;
    highlightPostTag?: string;
    facets?: string[];
    numericFilters?: string[] | string[][];
    tagFilters?: string[] | string[][];
    aroundLatLng?: string;
    aroundRadius?: number | "all";
    [key: string]: any;
  }

  export interface SearchResponse<T = any> {
    hits: Hit<T>[];
    nbHits: number;
    page: number;
    hitsPerPage: number;
    processingTimeMS: number;
    exhaustiveNbHits: boolean;
    query: string;
    params: string;
    [key: string]: any;
  }

  export interface Index<T = any> {
    search(query: string, options?: SearchOptions): Promise<SearchResponse<T>>;
    searchForFacetValues(
      facetName: string,
      facetQuery: string,
      params?: Record<string, any>
    ): Promise<any>;
    setSettings(settings: Record<string, any>): Promise<any>;
    saveObject(object: T & { objectID?: string }): Promise<any>;
    saveObjects(objects: Array<T & { objectID?: string }>): Promise<any>;
    getObject(objectID: string, attributesToRetrieve?: string[]): Promise<T>;
  }

  export interface MultipleQueriesQuery {
    indexName: string;
    query: string;
    params?: Record<string, any>;
  }

  export interface MultipleQueriesResponse<T = any> {
    results: Array<SearchResponse<T>>;
  }

  export interface SearchClient {
    initIndex<T = any>(indexName: string): Index<T>;
    search<T = any>(queries: MultipleQueriesQuery[]): Promise<MultipleQueriesResponse<T>>;
    clearCache?(): void;
  }

  export interface AlgoliaSearchOptions {
    protocol?: "https:" | "http:";
    hosts?: string[];
    headers?: Record<string, string>;
    [key: string]: any;
  }

  function algoliasearch(
    applicationId: string,
    apiKey: string,
    options?: AlgoliaSearchOptions
  ): SearchClient;

  export default algoliasearch;
}
