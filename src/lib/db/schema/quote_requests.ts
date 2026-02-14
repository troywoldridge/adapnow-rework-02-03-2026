import { pgTable, text, timestamp, uuid, date } from "drizzle-orm/pg-core";

// Quote requests
export const quoteRequests = pgTable("quote_requests", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: text("name").notNull(),
  company: text("company"),
  email: text("email").notNull(),
  phone: text("phone"),

  productType: text("product_type").notNull(),
  size: text("size"),
  colors: text("colors"),
  material: text("material"),
  finishing: text("finishing"),
  quantity: text("quantity"),
  notes: text("notes"),

  status: text("status").notNull().default("new"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
