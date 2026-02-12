// src/app/api/cart/current/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { logger, withRequestId } from "@/lib/logger";
import { getRequestId } from "@/lib/apiError";
import { carts, cartLines, cartAttachments } from "@/lib/db/schema";

import { getProductsByIds } from "@/lib/productResolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SID_COOKIE = "sid";

/* =========================================================
   Helpers
   ========================================================= */
function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

// Next 14 (sync) + Next 15 (async) cookie helper
async function getCookieJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

function toNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v: unknown, fallback = 0) {
  const n = Math.floor(toNum(v, fallback));
  return Number.isFinite(n) ? n : fallback;
}

function safeCurrency(v: unknown): "USD" | "CAD" {
  return v === "CAD" ? "CAD" : "USD";
}

/* =========================================================
   Response Shapes
   ========================================================= */
type CurrentCartLine = {
  id: string;
  productId: number;
  productName?: string | null;
  productCfImageId?: string | null;
  quantity: number;
  unitPriceCents?: number | null;
  lineTotalCents?: number | null;
  optionChain?: string | null;
};

type CurrentAttachment = {
  id: string;
  fileName: string;
  url?: string | null;
  key?: string | null;
  cfImageId?: string | null;
  createdAt?: string | null;
};

type CurrentEnvelope = {
  ok: true;
  cart: { id: string; sid: string; status: string; currency: "USD" | "CAD" } | null;

  // ✅ canonical shape used by CartPageClient
  lines: CurrentCartLine[];
  attachments: Record<string, CurrentAttachment[]>;
  selectedShipping: unknown | null;

  // ✅ backwards-compatible shape (used by older server pages)
  items: Array<{
    id: string;
    productId: number;
    quantity: number;
    optionIds: number[];
    unitPrice?: number; // dollars
    lineTotal?: number; // dollars
    name?: string | null;
    image?: string | null; // cf image id
  }>;

  // ✅ handy top-level summaries
  currency: "USD" | "CAD";
  subtotalCents: number;
  subtotal: number; // dollars
};

function emptyEnvelope(currency: "USD" | "CAD" = "USD"): CurrentEnvelope {
  return {
    ok: true,
    cart: null,
    lines: [],
    attachments: {},
    selectedShipping: null,
    items: [],
    currency,
    subtotalCents: 0,
    subtotal: 0,
  };
}

/* =========================================================
   Route
   ========================================================= */
export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const log = withRequestId(requestId);

  try {
    const jar = await getCookieJar();
    const sid = jar.get(SID_COOKIE)?.value ?? "";

    if (!sid) {
      return noStore(NextResponse.json(emptyEnvelope("USD"), { status: 200 }));
    }

    // 1) Find open cart for this sid
    const openCart = await db.query.carts.findFirst({
      where: and(eq(carts.sid, sid), eq(carts.status, "open")),
    });

    if (!openCart) {
      return noStore(NextResponse.json(emptyEnvelope("USD"), { status: 200 }));
    }

    const currency = safeCurrency((openCart as any).currency ?? "USD");

    // 2) Pull lines (no SQL join to products; we'll enrich from JSON)
    const lineRows = await db
      .select({
        lineId: cartLines.id,
        productId: cartLines.productId,
        quantity: (cartLines as any).quantity, // adapt to your schema
        unitPriceCents: (cartLines as any).unitPriceCents ?? null, // optional
        lineTotalCents: (cartLines as any).lineTotalCents ?? null, // optional
        optionChain: (cartLines as any).optionChain ?? null, // optional
      })
      .from(cartLines)
      .where(eq(cartLines.cartId, openCart.id));

    const productIds = [...new Set((lineRows || []).map((r) => toInt(r.productId, 0)).filter((n) => n > 0))];
    const productInfo = await getProductsByIds(productIds);

    const lines: CurrentCartLine[] = (lineRows || []).map((r) => {
      const pid = toInt(r.productId, 0);
      const qty = Math.max(1, toInt(r.quantity, 1));
      const info = productInfo.get(pid);

      const productName = info?.name ?? null;
      const productCfImageId = info?.cf_image_1_id ?? null;

      const unit = typeof r.unitPriceCents === "number" ? r.unitPriceCents : null;
      const total =
        typeof r.lineTotalCents === "number"
          ? r.lineTotalCents
          : typeof unit === "number"
          ? unit * qty
          : null;

      return {
        id: String(r.lineId),
        productId: pid,
        productName,
        productCfImageId,
        quantity: qty,
        unitPriceCents: unit,
        lineTotalCents: typeof total === "number" ? total : null,
        optionChain: (r.optionChain as any) ?? null,
      };
    });

    // 3) Attachments per line (uploaded artwork)
    const lineIds = lines.map((l) => l.id).filter(Boolean);

    const attachmentsByLine: Record<string, CurrentAttachment[]> = {};
    if (lineIds.length > 0) {
      const attRows = await db
        .select({
          id: cartAttachments.id,
          lineId: cartAttachments.lineId,
          fileName: cartAttachments.fileName,
          url: cartAttachments.url,
          key: cartAttachments.key,
          createdAt: (cartAttachments as any).createdAt,
          // If you add a CF image id column later, map it here:
          // cfImageId: (cartAttachments as any).cfImageId ?? null,
        })
        // NOTE: lineId type must match. If your DB stores UUID/text, this is perfect.
        // If it stores int, you're still okay because your CartPageClient treats ids as strings.
        .from(cartAttachments)
        .where(inArray(cartAttachments.lineId, lineIds as any));

      for (const a of attRows) {
        const lid = String(a.lineId);
        if (!attachmentsByLine[lid]) attachmentsByLine[lid] = [];
        attachmentsByLine[lid].push({
          id: String(a.id),
          fileName: a.fileName ?? "Artwork",
          url: a.url ?? null,
          key: a.key ?? null,
          // cfImageId: (a as any).cfImageId ?? null,
          createdAt: a.createdAt ? String(a.createdAt) : null,
        });
      }
    }

    // 4) Selected shipping (if you persist it on carts)
    const selectedShipping =
      (openCart as any).selectedShipping ?? (openCart as any).shipping ?? null;

    // 5) Totals (prefer stored totals if you add them later; for now compute from lines)
    const subtotalCents = lines.reduce((sum, l) => {
      const n = typeof l.lineTotalCents === "number" ? l.lineTotalCents : 0;
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

    // 6) Back-compat `items` (server pages / older clients)
    // optionIds aren’t present in cartLines currently; keep empty for now.
    const items = lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      quantity: l.quantity,
      optionIds: [] as number[],
      unitPrice: typeof l.unitPriceCents === "number" ? l.unitPriceCents / 100 : undefined,
      lineTotal: typeof l.lineTotalCents === "number" ? l.lineTotalCents / 100 : undefined,
      name: l.productName ?? null,
      image: l.productCfImageId ?? null,
    }));

    const body: CurrentEnvelope = {
      ok: true,
      cart: {
        id: String(openCart.id),
        sid: String(openCart.sid),
        status: String(openCart.status),
        currency,
      },

      lines,
      attachments: attachmentsByLine,
      selectedShipping,

      // ✅ back-compat
      items,

      currency,
      subtotalCents,
      subtotal: subtotalCents / 100,
    };

    return noStore(NextResponse.json(body, { status: 200 }));
  } catch (e) {
    log.error("/api/cart/current GET error", {
      message: e instanceof Error ? e.message : String(e),
    });
    // Keep API resilient: return an ok envelope with empty cart for client safety.
    return noStore(NextResponse.json(emptyEnvelope("USD"), { status: 200 }));
  }
}
