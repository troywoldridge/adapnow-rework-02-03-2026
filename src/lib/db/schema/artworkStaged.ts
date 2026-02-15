// src/lib/db/schema/artworkStaged.ts
//
// DEPRECATED SHIM — DO NOT DEFINE TABLES HERE.
// Legacy import compatibility only.
//
// Canonical staged-artwork table is `artwork_uploads`:
//   import { artworkUploads } from "@/lib/db/schema/artwork_uploads";
//
// This file re-exports the `artwork_staged` shim, which maps to `artwork_uploads`.

export * from "./artwork_staged";
