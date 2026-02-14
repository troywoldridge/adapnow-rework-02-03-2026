import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sendArtworkNeededEmail } from "@/lib/email/sendArtworkNeededEmail";

type MissingItem = {
  orderItemId: string;
  productName: string;
  numSides: number;
  missingSides: number[];
};

type MissingOrder = {
  orderId: string;
  email: string;
  name: string;
  placedAt: string | null;
  missingItems: MissingItem[];
};

function siteBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://adapnow.com";
  return String(raw).trim().replace(/\/+$/, "");
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function parseArtworkMap(v: unknown): Record<string, string> {
  // Expect JSON like {"1":"url","2":"url"} but be tolerant.
  if (!v) return {};
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(o)) {
      if (isNonEmptyString(val)) out[String(k)] = val.trim();
    }
    return out;
  }
  try {
    const parsed = JSON.parse(String(v));
    return parseArtworkMap(parsed);
  } catch {
    return {};
  }
}

function computeMissingSides(numSides: number, artwork: Record<string, string>): number[] {
  const sides = Math.max(1, Number.isFinite(numSides) ? Math.floor(numSides) : 1);
  const missing: number[] = [];
  for (let s = 1; s <= sides; s++) {
    const url = artwork[String(s)];
    if (!isNonEmptyString(url)) missing.push(s);
  }
  return missing;
}

async function ensureEmailDeliveriesTable(): Promise<void> {
  // Safety net: in case migration hasn't run yet (dev environments).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_deliveries (
      id bigserial PRIMARY KEY,
      kind text NOT NULL,
      order_id text NOT NULL,
      to_email text NOT NULL,
      sent_at timestamptz NOT NULL DEFAULT now(),
      provider text NOT NULL DEFAULT 'resend',
      provider_id text NULL,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_kind_order_unique
      ON email_deliveries(kind, order_id);
  `);
}

async function alreadySent(kind: string, orderId: string): Promise<boolean> {
  const res = await db.execute(sql`
    SELECT 1
    FROM email_deliveries
    WHERE kind = ${kind} AND order_id = ${orderId}
    LIMIT 1;
  `);
  // drizzle execute returns rows in various shapes; normalize:
  const rows = (res as any)?.rows ?? (Array.isArray(res) ? res : []);
  return rows.length > 0;
}

async function recordSent(args: {
  kind: string;
  orderId: string;
  toEmail: string;
  providerId: string | null;
  meta?: unknown;
}) {
  await db.execute(sql`
    INSERT INTO email_deliveries(kind, order_id, to_email, provider, provider_id, meta)
    VALUES (
      ${args.kind},
      ${args.orderId},
      ${args.toEmail},
      'resend',
      ${args.providerId},
      ${JSON.stringify(args.meta ?? {})}::jsonb
    )
    ON CONFLICT (kind, order_id) DO NOTHING;
  `);
}

/**
 * Find recent orders with missing artwork.
 *
 * ASSUMES:
 * - orders table has: id, email/name fields
 * - order_items table has: id, order_id, product_name, num_sides, artwork (jsonb)
 *
 * If your columns are named differently, paste schema and I’ll map it.
 */
export async function findOrdersMissingArtwork(opts?: {
  // only look back N hours to avoid emailing ancient test orders
  lookbackHours?: number;
  limit?: number;
}): Promise<MissingOrder[]> {
  const lookbackHours = Math.max(1, Math.floor(opts?.lookbackHours ?? 72));
  const limit = Math.max(1, Math.min(200, Math.floor(opts?.limit ?? 50)));

  // Pull candidate items where artwork is missing (artwork map doesn't have all sides)
  // We do a broad fetch then compute missing sides in JS for clarity.
  const res = await db.execute(sql`
    SELECT
      o.id::text as order_id,
      COALESCE(o.email, o.customer_email, '')::text as email,
      COALESCE(o.name, o.customer_name, '')::text as name,
      o.placed_at::text as placed_at,

      oi.id::text as order_item_id,
      COALESCE(oi.product_name, oi.name, 'Item')::text as product_name,
      COALESCE(oi.num_sides, 1)::int as num_sides,
      COALESCE(oi.artwork, '{}'::jsonb) as artwork
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.placed_at >= now() - (${lookbackHours}::int || ' hours')::interval
    ORDER BY o.placed_at DESC
    LIMIT ${limit * 50};
  `);

  const rows = (res as any)?.rows ?? (Array.isArray(res) ? res : []);
  if (!rows.length) return [];

  // Group by order, compute missing sides
  const byOrder = new Map<string, MissingOrder>();

  for (const r of rows) {
    const orderId = String(r.order_id || "");
    const email = String(r.email || "").trim();
    const name = String(r.name || "").trim() || "there";

    if (!orderId || !email) continue;

    const numSides = Number(r.num_sides || 1);
    const artwork = parseArtworkMap(r.artwork);
    const missingSides = computeMissingSides(numSides, artwork);

    if (missingSides.length === 0) continue;

    const item: MissingItem = {
      orderItemId: String(r.order_item_id || ""),
      productName: String(r.product_name || "Item"),
      numSides: Math.max(1, Math.floor(numSides)),
      missingSides,
    };

    const existing =
      byOrder.get(orderId) ||
      ({
        orderId,
        email,
        name,
        placedAt: r.placed_at ? String(r.placed_at) : null,
        missingItems: [],
      } as MissingOrder);

    existing.missingItems.push(item);
    byOrder.set(orderId, existing);
  }

  return Array.from(byOrder.values());
}

/**
 * Scan and send artwork-needed emails for orders that have missing artwork.
 * Idempotent: uses email_deliveries unique constraint to avoid duplicates.
 */
export async function scanAndSendArtworkNeededEmails(opts?: {
  lookbackHours?: number;
  limit?: number;
}): Promise<{ ok: true; checked: number; sent: number; skipped: number }> {
  await ensureEmailDeliveriesTable();

  const candidates = await findOrdersMissingArtwork({
    lookbackHours: opts?.lookbackHours ?? 72,
    limit: opts?.limit ?? 50,
  });

  let sent = 0;
  let skipped = 0;

  for (const o of candidates) {
    const kind = "artwork_needed";

    // already sent => skip
    if (await alreadySent(kind, o.orderId)) {
      skipped++;
      continue;
    }

    const base = siteBaseUrl();
    const uploadUrl = `${base}/account/orders/${encodeURIComponent(o.orderId)}?upload=1`;

    const emailResult = await sendArtworkNeededEmail({
      to: o.email,
      name: o.name,
      orderId: o.orderId,
      uploadUrl,
    });

    await recordSent({
      kind,
      orderId: o.orderId,
      toEmail: o.email,
      providerId: emailResult.id,
      meta: {
        placedAt: o.placedAt,
        missingItems: o.missingItems.map((m) => ({
          productName: m.productName,
          numSides: m.numSides,
          missingSides: m.missingSides,
        })),
      },
    });

    sent++;
  }

  return { ok: true, checked: candidates.length, sent, skipped };
}
