// src/lib/db/schema/index.ts
// Barrel exports for "@/lib/db/schema".
// Keep this aligned with files in src/lib/db/schema.
//
// NOTE: Avoid exporting both artwork_staged.ts and artworkStaged.ts.
// Pick ONE canonical module to prevent duplicate table definitions / name collisions.

export * from "./enums";
export * from "./types";

// Canonical staged artwork schema export (choose one)
export * from "./artworkStaged";
// export * from "./artworkStaged"; // <- keep disabled unless you delete/rename artwork_staged.ts

export * from "./artworkUploads";

export * from "./cart";
export * from "./cartArtwork";
export * from "./cartAttachments";
export * from "./cartCredits";
export * from "./cartLines";

export * from "./customer";
export * from "./customerAddresses";

export * from "./loyalty_transactions";
export * from "./loyalty_wallets";

export * from "./orders";

export * from "./price_tiers";
export * from "./product_reviews";

export * from "./sinaliteProducts";

export * from "./heroEvents";
// export * from "./sessions";
// export * from "./uploads";
