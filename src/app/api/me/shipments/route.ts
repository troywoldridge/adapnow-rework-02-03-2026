// src/app/api/me/shipments/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Shipment = {
  carrier: string;
  trackingNumber: string;
  status: string;
  eta?: string | null;
  events?: { time: string; description: string; location?: string }[];
};

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

const QuerySchema = z.object({
  orderId: z.string().trim().min(1),
});

function mapShipment(s: any): Shipment {
  const carrier = String(s?.carrier ?? s?.provider ?? "Unknown");
  const trackingNumber = String(s?.trackingNumber ?? s?.tracking_number ?? s?.tracking ?? "");
  const status = String(s?.status ?? s?.currentStatus ?? "");

  const etaRaw = s?.eta ?? s?.estimatedDelivery ?? s?.estimated_arrival ?? null;
  const eta = etaRaw == null ? null : String(etaRaw);

  const events = Array.isArray(s?.events)
    ? s.events
        .map((e: any) => ({
          time: String(e?.time ?? e?.timestamp ?? e?.date ?? ""),
          description: String(e?.description ?? e?.status ?? ""),
          ...(e?.location ? { location: String(e.location) } : {}),
        }))
        .filter((e: any) => e.time || e.description)
    : undefined;

  return { carrier, trackingNumber, status, eta, events };
}

function getSessionIdFromCookies(): string | null {
  const jar = cookies();
  return jar.get("adap_sid")?.value ?? jar.get("sid")?.value ?? null;
}

function originFromReq(req: NextRequest): string {
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

/**
 * /api/me/shipments?orderId=...
 *
 * Behavior:
 * - Authorizes access to the order by:
 *   - signed-in Clerk userId OR
 *   - guest sid cookie (adap_sid/sid)
 * - If user is signed in and order is currently "owned" by guest sid, we claim it to the userId.
 * - Shipment source preference:
 *   1) If order row already contains shipments JSON (optional), return that.
 *   2) If provider is sinalite and providerId exists, fetch shipments from internal Sinalite route.
 */
export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      orderId: url.searchParams.get("orderId") ?? "",
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "missing_or_invalid_orderId",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const orderId = parsed.data.orderId;

    const { userId } = await auth();
    const sid = getSessionIdFromCookies();

    const [o] =
      (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)) ?? [];

    if (!o) {
      return NextResponse.json(
        { ok: true as const, requestId, shipments: [] as Shipment[] },
        { status: 200, headers: { "x-request-id": requestId } }
      );
    }

    // Claim guest → user if the order is currently tied to the guest session id.
    // (This preserves your old behavior but is safer/cleaner about responses.)
    const oUserId = (o as any)?.userId ?? null;
    if (userId && sid && oUserId === sid) {
      await db.update(orders).set({ userId }).where(eq(orders.id, orderId));
      (o as any).userId = userId;
    }

    // Authorization: order must belong to either signed-in user or current guest sid.
    const allowedOwners = [userId, sid].filter((x): x is string => Boolean(x && x.trim()));
    const finalOwner = String((o as any)?.userId ?? "");
    if (!allowedOwners.includes(finalOwner)) {
      return NextResponse.json(
        { ok: false as const, requestId, error: "forbidden" },
        { status: 403, headers: { "x-request-id": requestId } }
      );
    }

    const shipments: Shipment[] = [];

    // Optional: if you later add a shipments JSON column, this route will automatically use it.
    // We intentionally "duck type" to stay compatible across schema changes.
    const embedded =
      (o as any)?.shipments ??
      (o as any)?.shipmentsJson ??
      (o as any)?.shipments_json ??
      null;

    if (Array.isArray(embedded)) {
      shipments.push(...embedded.map(mapShipment));
    } else if ((o as any)?.provider === "sinalite" && (o as any)?.providerId) {
      const providerId = String((o as any).providerId);

      // Prefer INTERNAL_API_BASE (supports server-to-server), fallback to same-origin.
      const base =
        (process.env.INTERNAL_API_BASE && process.env.INTERNAL_API_BASE.trim()) ||
        originFromReq(req);

      if (!base) {
        return NextResponse.json(
          {
            ok: false as const,
            requestId,
            error: "Missing INTERNAL_API_BASE and could not infer request origin",
          },
          { status: 500, headers: { "x-request-id": requestId } }
        );
      }

      const upstreamUrl = `${base.replace(/\/+$/, "")}/api/sinalite/orders/${encodeURIComponent(
        providerId
      )}/shipments`;

      const upstream = await fetch(upstreamUrl, {
        cache: "no-store",
        headers: {
          // Forward auth/cookies if present (useful when INTERNAL_API_BASE points back to same app).
          ...(req.headers.get("authorization")
            ? { Authorization: req.headers.get("authorization") as string }
            : {}),
          ...(req.headers.get("cookie") ? { Cookie: req.headers.get("cookie") as string } : {}),
          "x-request-id": requestId,
        },
      });

      if (!upstream.ok) {
        return NextResponse.json(
          {
            ok: false as const,
            requestId,
            error: `failed_to_fetch_shipments:${upstream.status}`,
            shipments: [] as Shipment[],
          },
          // Keep as 200 if you want UI to be resilient; switch to 502 if you want strict semantics.
          { status: 200, headers: { "x-request-id": requestId } }
        );
      }

      const payload = await upstream.json().catch(() => null);

      const rawShipments = Array.isArray((payload as any)?.shipments)
        ? (payload as any).shipments
        : Array.isArray(payload)
          ? payload
          : [];

      shipments.push(...rawShipments.map(mapShipment));
    }

    return NextResponse.json(
      { ok: true as const, requestId, shipments },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false as const, requestId, error: message || "shipments_failed" },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
