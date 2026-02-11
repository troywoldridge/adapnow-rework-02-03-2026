// src/lib/db/schema/sinaliteProducts.ts
// Sinalite product ingestion schema – supports both regular products and roll labels.

import {
  pgTable,
  integer,
  text,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── Master product list (from GET /product) ─────────────────────────────────
export const sinaliteProducts = pgTable(
  "sinalite_products",
  {
    productId: integer("product_id").primaryKey(),
    name: text("name"),
    sku: text("sku"),
    rawJson: jsonb("raw_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxSinaliteProductsSku: index("idx_sinalite_products_sku").on(t.sku),
  })
);

// ─── REGULAR PRODUCTS ───────────────────────────────────────────────────────
// Array 1: options { id, group, name }
export const sinaliteProductOptions = pgTable(
  "sinalite_product_options",
  {
    productId: integer("product_id").notNull(),
    storeCode: text("store_code").notNull(),
    optionId: integer("option_id").notNull(),
    optionGroup: text("option_group").notNull(),
    optionName: text("option_name").notNull(),
    rawJson: jsonb("raw_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.productId, t.storeCode, t.optionId] }),
    idxSinaliteProductOptionsProduct: index("idx_sinalite_product_options_product").on(
      t.productId,
      t.storeCode
    ),
  })
);

// Array 2: pricing { hash, value }
export const sinaliteProductPricing = pgTable(
  "sinalite_product_pricing",
  {
    productId: integer("product_id").notNull(),
    storeCode: text("store_code").notNull(),
    hash: text("hash").notNull(),
    value: text("value").notNull(),
    rawJson: jsonb("raw_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.productId, t.storeCode, t.hash] }),
    idxSinaliteProductPricingProduct: index("idx_sinalite_product_pricing_product").on(
      t.productId,
      t.storeCode
    ),
  })
);

// Array 3: metadata/flags (raw JSON)
export const sinaliteProductMetadata = pgTable(
  "sinalite_product_metadata",
  {
    productId: integer("product_id").notNull(),
    storeCode: text("store_code").notNull(),
    rawJson: jsonb("raw_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.productId, t.storeCode] }),
  })
);

// ─── ROLL LABEL PRODUCTS ────────────────────────────────────────────────────
// Array 1: option definitions { name, label, option_id, opt_val_id, option_val, ... }
export const sinaliteRollLabelOptions = pgTable(
  "sinalite_roll_label_options",
  {
    productId: integer("product_id").notNull(),
    storeCode: text("store_code").notNull(),
    optionId: integer("option_id").notNull(),
    optValId: integer("opt_val_id").notNull(),
    name: text("name").notNull(),
    label: text("label").notNull(),
    optionVal: text("option_val").notNull(),
    htmlType: text("html_type"),
    optSortOrder: integer("opt_sort_order"),
    optValSortOrder: integer("opt_val_sort_order"),
    imgSrc: text("img_src"),
    extraTurnaroundDays: integer("extra_turnaround_days"),
    rawJson: jsonb("raw_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.productId, t.storeCode, t.optionId, t.optValId] }),
    idxSinaliteRollLabelOptionsProduct: index("idx_sinalite_roll_label_options_product").on(
      t.productId,
      t.storeCode
    ),
  })
);

// Array 2: exclusions
export const sinaliteRollLabelExclusions = pgTable(
  "sinalite_roll_label_exclusions",
  {
    productId: integer("product_id").notNull(),
    storeCode: text("store_code").notNull(),
    exclusionId: integer("exclusion_id").notNull(), // row index for uniqueness
    sizeId: integer("size_id"),
    qty: integer("qty"),
    pricingProductOptionEntityId1: integer("pricing_product_option_entity_id_1"),
    pricingProductOptionValueEntityId1: integer("pricing_product_option_value_entity_id_1"),
    pricingProductOptionEntityId2: integer("pricing_product_option_entity_id_2"),
    pricingProductOptionValueEntityId2: integer("pricing_product_option_value_entity_id_2"),
    rawJson: jsonb("raw_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.productId, t.storeCode, t.exclusionId] }),
    idxSinaliteRollLabelExclusionsProduct: index(
      "idx_sinalite_roll_label_exclusions_product"
    ).on(t.productId, t.storeCode),
  })
);

// Array 3: option content
export const sinaliteRollLabelContent = pgTable(
  "sinalite_roll_label_content",
  {
    productId: integer("product_id").notNull(),
    storeCode: text("store_code").notNull(),
    pricingProductOptionValueEntityId: integer("pricing_product_option_value_entity_id").notNull(),
    contentType: text("content_type").notNull(),
    content: text("content"),
    rawJson: jsonb("raw_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [
        t.productId,
        t.storeCode,
        t.pricingProductOptionValueEntityId,
        t.contentType,
      ],
    }),
    idxSinaliteRollLabelContentProduct: index("idx_sinalite_roll_label_content_product").on(
      t.productId,
      t.storeCode
    ),
  })
);
