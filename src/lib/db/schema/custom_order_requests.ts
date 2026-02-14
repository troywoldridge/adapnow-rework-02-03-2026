import { pgTable, text, timestamp, uuid, date } from "drizzle-orm/pg-core";

export const customOrderRequests = pgTable("custom_order_requests", {
  id: uuid("id").defaultRandom().primaryKey(),

  company: text("company").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),

  quoteNumber: text("quote_number").notNull(),
  po: text("po"),

  instructions: text("instructions"),
  expectedDate: date("expected_date"),
  shippingOption: text("shipping_option"),

  artworkNote: text("artwork_note"),

  status: text("status").notNull().default("new"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});