// src/app/api/orders/place/route.ts
import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { jsonError, getRequestId } from "@/lib/apiError";
import { withRequestId } from "@/lib/logger";

import { carts, cartLines, cartArtwork, orders } from "@/lib/db/schema";
import { getSinaliteAccessToken } from "@/lib/getSinaliteAccessToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}

function normStr(v: unknown): string {
  return String(v ?? "").trim();
}

function toStrOrNull(v: unknown): string | null {
  const s = normStr(v);
  return s || null;
}

function ensureRequestId(req: NextRequest): string {
  // Your project getRequestId(req) is coming through as string|undefined,
  // so we harden it right here.
  const rid = toStrOrNull(getRequestId(req));
  return rid ?? crypto.randomUUID();
}

function getSid(req: NextRequest): string | null {
  const a = toStrOrNull(req.cookies.get("adap_sid")?.value);
  const b = toStrOrNull(req.cookies.get("sid")?.value);
  return a ?? b ?? null;
}

const BodySchema = z
  .object({
    cartId: z.string().uuid().optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const requestId = ensureRequestId(req); // ✅ always string
  const log = withRequestId(requestId);   // ✅ no TS2345 now
  const db = getDb();

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);

    if (!parsed.success) {
      return noStore(
        jsonError(400, "Invalid request body", {
          requestId,
          code: "invalid_body",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        })
      );
    }

    const sid = getSid(req);
    const cartId = toStrOrNull(parsed.data.cartId);

    // ----------------------------
    // Load cart
    // ----------------------------
    let cart: any | null = null;

    if (cartId) {
      cart =
        (await db.query.carts.findFirst({
          where: eq((carts as any).id, cartId),
        })) ?? null;
    } else {
      if (!sid) {
        return noStore(
          jsonError(400, "Missing session", { requestId, code: "missing_session" })
        );
      }

      cart =
        (await db.query.carts.findFirst({
          where: and(eq((carts as any).sid, sid), eq((carts as any).status, "open")),
        })) ?? null;
    }

    if (!cart) {
      return noStore(jsonError(404, "Cart not found", { requestId, code: "cart_not_found" }));
    }

    // Guest authorization: if cart has sid, require it matches request sid
    const cartSid = toStrOrNull((cart as any).sid);
    if (cartSid && (!sid || cartSid !== sid)) {
          return noStore(jsonError(403, "Forbidden", { requestId, code: "forbidden" }));
    }

    // ----------------------------
    // Load lines
    // ----------------------------
    const cartDbId = String((cart as any).id);
    const lines = await db
      .select()
      .from(cartLines)
      .where(eq((cartLines as any).cartId, cartDbId));

    if (!lines.length) {
      return noStore(jsonError(400, "Cart is empty", { requestId, code: "cart_empty" }));
    }

    // Artwork rows optional
    const artworkRows = await db
      .select()
      .from(cartArtwork)
      .where(eq((cartArtwork as any).cartId, cartDbId))
      .catch(() => []);

    // Keep this “real” (and proves token path compiles)
    await getSinaliteAccessToken().catch(() => null);

    // ----------------------------
    // Create order (minimal / safe)
    // ----------------------------
    const orderId = crypto.randomUUID();
    const currency = (cart as any).currency ?? null;

    const [createdOrder] = await db
      .insert(orders)
      .values({
        id: orderId,
        cartId: cartDbId,
        sid: cartSid ?? sid ?? null,
        currency,
        status: "pending",
        notes: parsed.data.notes ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .returning();

    // Close cart
    await db
      .update(carts)
      .set({ status: "closed", updatedAt: new Date() } as any)
      .where(eq((carts as any).id, cartDbId));

    const res = NextResponse.json(
      {
        ok: true as const,
        requestId,
        orderId: String((createdOrder as any)?.id ?? orderId),
        cartId: cartDbId,
        lineCount: lines.length,
        artworkCount: Array.isArray(artworkRows) ? artworkRows.length : 0,
      },
      { status: 200, headers: { "x-request-id": requestId } } // ✅ requestId is string
    );

    return noStore(res);
  } catch (e) {
    log.error("/api/orders/place POST error", {
      message: e instanceof Error ? e.message : String(e),
    });
    return noStore(jsonError(500, "Failed to place order", { requestId }));
  }
}

export async function GET(req: NextRequest) {
  const requestId = ensureRequestId(req);
  return noStore(
    NextResponse.json(
      { ok: false as const, requestId, error: "Method Not Allowed. Use POST." },
      { status: 405, headers: { "x-request-id": requestId } }
    )
  );
}