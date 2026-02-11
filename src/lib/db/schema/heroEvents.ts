// src/lib/db/schema/heroEvents.ts
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * hero_events
 * Lightweight analytics events for hero/banner interactions.
 *
 * NOTE: Safe to add now; you can migrate later in one shot.
 */
export const heroEvents = pgTable(
  "hero_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    // "impression" | "click"
    type: text("type").notNull(),

    slideId: text("slide_id").notNull(),
    ctaText: text("cta_text"),

    page: text("page").notNull(),

    // guest session id (cookie)
    sid: text("sid"),

    // request context
    userAgent: text("user_agent"),
    referrer: text("referrer"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    heroEventsCreatedAtIdx: index("hero_events_created_at_idx").on(t.createdAt),
    heroEventsSlideIdx: index("hero_events_slide_id_idx").on(t.slideId),
    heroEventsTypeIdx: index("hero_events_type_idx").on(t.type),
    heroEventsSidIdx: index("hero_events_sid_idx").on(t.sid),
  }),
);
