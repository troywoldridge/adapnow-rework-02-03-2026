import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const guideDownloadEvents = pgTable(
  "guide_download_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    href: text("href").notNull(),
    label: text("label"),
    categoryPath: text("category_path"),
    sizeBytes: integer("size_bytes"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    guideDownloadEventsCreatedAtIdx: index("guide_download_events_created_at_idx").on(t.createdAt),
  }),
);
