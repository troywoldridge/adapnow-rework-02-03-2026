// src/lib/db/schema/artworkStaged.ts
//
// Back-compat alias.
// Some routes still import `artworkStaged`, but the real table is `artworkUploads`.
// This shim lets you keep rebuilding without touching every import yet.

export { artworkUploads as artworkStaged } from "./artworkUploads";
