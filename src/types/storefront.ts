// src/types/storefront.ts
//
// Canonical primitive types used across client + server.
// Keep shared primitives here to avoid name collisions across modules.

export type Id = string | number;

export type Store = "US" | "CA";
export type Currency = "USD" | "CAD";
export type Country = Store;

// If you want storefront-ish DTOs here later, you can add them.
// For now: keep this file focused on shared primitives to prevent re-export conflicts.
