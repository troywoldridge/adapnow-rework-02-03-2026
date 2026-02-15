// src/lib/db/schema/artwork_staged.ts
//
// DEPRECATED SHIM — Stage 3 Consolidation
// ------------------------------------------------------------
// There is NO physical `artwork_staged` table in this database.
// The canonical staged-artwork table is `public.artwork_uploads`.
//
// Update imports to:
//   import { artworkUploads } from "@/lib/db/schema/artwork_uploads";
//
// This shim preserves compatibility for code that references artworkStaged/artwork_staged.

export * from "./artwork_uploads";

// Back-compat named export: artworkStaged -> artworkUploads
export { artworkUploads as artworkStaged } from "./artwork_uploads";

// Back-compat type aliases
export type { ArtworkUpload as ArtworkStaged, NewArtworkUpload as NewArtworkStaged } from "./artwork_uploads";
