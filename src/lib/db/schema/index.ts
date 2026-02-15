// src/lib/db/schema/index.ts
// Central export barrel for Drizzle schema.
// IMPORTANT: avoid duplicate named exports across modules (TS2308).

export * from "./enums";

// Export tables/relations/etc
export * from "./addresses";
export * from "./artwork_staged";
export * from "./artwork_uploads";
export * from "./cart_artwork";
// export * from "./carts";
// export * from "./cart_lines";
// export * from "./cart_attachments";
// export * from "./customers";
// export * from "./email_deliveries";
// export * from "./email_outbox";
// export * from "./guide_download_events";
export * from "./orders";
// export * from "./order_items";
export * from "./quote_requests";
export * from "./custom_order_requests";

// loyalty_transactions conflicts with enums (loyaltyReason). Export it explicitly to avoid collisions.
export {
  loyaltyTransactions,
  // If you have other exports from loyalty_transactions, list them here:
  // loyaltyTransactionItems,
  // loyaltyTransactionInsertSchema,
  // loyaltyTransactionSelectSchema,
} from "./loyalty_transactions";

// export * from "./products";

// export * from "./users";
