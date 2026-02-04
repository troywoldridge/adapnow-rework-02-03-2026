// src/lib/db/schema/price_tiers.ts
import { pgTable, serial, text, integer, numeric } from "drizzle-orm/pg-core";

export const priceTiers = pgTable("price_tiers", {
  // matches: integer PK default nextval('price_tiers_id_seq'::regclass)
  id: serial("id").primaryKey(),

  scope: text("scope").notNull(),

  scopeId: integer("scope_id"),

  store: text("store").notNull(),

  minQty: integer("min_qty").notNull(),

  maxQty: integer("max_qty"),

  mult: numeric("mult", { precision: 6, scale: 3 }).notNull(),

  floorPct: numeric("floor_pct", { precision: 5, scale: 3 }),
});
