// src/lib/db/schema/index.ts
// CLEAN canonical Drizzle export surface (no ambiguous re-exports)

export * from "./types";
export * from "./enums";

/* ---------------- Core ---------------- */
export * from "./addresses";

/* ---------------- Cart ---------------- */
export * from "./cart";            // carts
export * from "./cartLines";       // cartLines
export * from "./cartCredits";     // cartCredits
export * from "./cartAttachments"; // cartAttachments
export * from "./cart_artwork";    // cartArtwork

/* ---------------- Artwork ---------------- */
export * from "./artwork_uploads"; // artworkUploads
export * from "./artwork_staged";  // artworkStaged shim

/* ---------------- Customer ---------------- */
export * from "./customer";
export * from "./customerAddresses";

/* ---------------- Orders ---------------- */
export * from "./orders";
export * from "./orderItems";
export * from "./orderSessions";

/* ---------------- Loyalty ---------------- */
export * from "./loyalty_wallets";
export * from "./loyalty_transactions"; // now safe: no loyaltyReason export inside this module

/* ---------------- Marketing ---------------- */
export * from "./heroEvents";

/* ---------------- Pricing + Reviews ---------------- */
export * from "./price_tiers";
export * from "./product_reviews";

/* ---------------- Leads ---------------- */
export * from "./quote_requests";
export * from "./custom_order_requests";

/* ---------------- Sinalite ---------------- */
export * from "./sinaliteProducts";
