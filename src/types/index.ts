// src/types/index.ts
// Prefer importing from here: `@/types`
//
// Re-export canonical/shared types.
// Avoid wildcard re-exports that cause name collisions during rebuild.

export * from "./storefront";
export * from "./shipping";
export * from "./image";
export * from "./heroSlide";

// Legacy modules (ok to keep during transition)
export * from "./catalog";
export * from "./category";
export * from "./subcategory";
export * from "./product";

// API DTOs
export * from "./api";

// NOTE:
// Domain models are temporarily NOT re-exported here to prevent collisions
// while the rebuild is in progress.
// Re-enable once domain/* files import Currency/Id from ./storefront instead
// of exporting their own primitives.
//
// export * from "./domain/cart";
// export * from "./domain/order";
// export * from "./domain/session";
