import "server-only";

import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Shipment = {
  carrier: string;
  trackingNumber: string;
  status: string;
  eta?: string | null;
  events?: { time: string; description: string; location?: string }[];
};

function noStoreJson(req: NextRequest, body: any, status = 200) {
  const requestId = body?.requestId || getRequestId(req);
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

const QuerySchema = z
  .object({
    orderId: z.string().trim().min(1),
  })
  .strict();

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

// Next 14 (sync) + Next 15 (async) compatible cookies()
async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

async function getSessionIdFromCookies(): Promise<string | null> {
  const jar = await getJar();
  return jar.get?.("adap_sid")?.value ?? jar.get?.("sid")?.value ?? null;
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
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "missing_or_invalid_orderId",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        400
      );
    }

    const orderId = parsed.data.orderId;

    const { userId } = await auth();
    const sid = await getSessionIdFromCookies();

    const [o] = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)) ?? [];

    if (!o) {
      return noStoreJson(req, { ok: true as const, requestId, shipments: [] as Shipment[] }, 200);
    }

    // Claim guest → user if the order is currently tied to the guest session id.
    const oUserId = (o as any)?.userId ?? null;
    if (userId && sid && oUserId === sid) {
      await db.update(orders).set({ userId }).where(eq(orders.id, orderId));
      (o as any).userId = userId;
    }

    // Authorization: order must belong to either signed-in user or current guest sid.
    const allowedOwners = [userId, sid].filter((x): x is string => Boolean(x && x.trim()));
    const finalOwner = String((o as any)?.userId ?? "");
    if (!allowedOwners.includes(finalOwner)) {
      return noStoreJson(req, { ok: false as const, requestId, error: "forbidden" }, 403);
    }

    const shipments: Shipment[] = [];

    // Optional embedded shipment JSON (duck-typed for forward compatibility)
    const embedded =
      (o as any)?.shipments ??
      (o as any)?.shipmentsJson ??
      (o as any)?.shipments_json ??
      null;

    if (Array.isArray(embedded)) {
      shipments.push(...embedded.map(mapShipment));
    } else if ((o as any)?.provider === "sinalite" && (o as any)?.providerId) {
      const providerId = String((o as any).providerId);

      // Prefer INTERNAL_API_BASE (server-to-server), fallback to same-origin.
      const base =
        (process.env.INTERNAL_API_BASE && process.env.INTERNAL_API_BASE.trim()) ||
        originFromReq(req);

      if (!base) {
        return noStoreJson(
          req,
          {
            ok: false as const,
            requestId,
            error: "missing_internal_api_base",
          },
          500
        );
      }

      const upstreamUrl = `${base.replace(/\/+$/, "")}/api/sinalite/orders/${encodeURIComponent(
        providerId
      )}/shipments`;

      const upstream = await fetch(upstreamUrl, {
        cache: "no-store",
        headers: {
          ...(req.headers.get("authorization")
            ? { Authorization: req.headers.get("authorization") as string }
            : {}),
          ...(req.headers.get("cookie") ? { Cookie: req.headers.get("cookie") as string } : {}),
          "x-request-id": requestId,
        },
      });

      if (!upstream.ok) {
        // Keep 200 for UI resilience; caller can show "no tracking yet"
        return noStoreJson(
          req,
          {
            ok: false as const,
            requestId,
            error: `failed_to_fetch_shipments:${upstream.status}`,
            shipments: [] as Shipment[],
          },
          200
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

    return noStoreJson(req, { ok: true as const, requestId, shipments }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return noStoreJson(
      req,
      { ok: false as const, requestId, error: message || "shipments_failed" },
      500
    );
  }
}
