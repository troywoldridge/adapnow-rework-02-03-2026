/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";
import { cartAttachments } from "@/lib/db/schema/cartAttachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/cart/attachments
 *
 * Attach one or more uploaded artifacts (R2 keys / public URLs) to one cart line.
 *
 * Supports client shapes:
 *  - { key, url, fileName? }
 *  - { key, publicUrl, fileName? }
 *  - { storageId, fileName? } where storageId may be a key or a URL
 *
 * Body:
 * {
 *   productId: number, // accepted for compatibility (NOT stored in cart_attachments by this route)
 *   cartLines: [{ id?: string, lineId?: string }],
 *   parts: ClientPart[]
 * }
 *
 * Guarantees:
 * - no-store + requestId
 * - robust parsing + normalization
 * - verifies cart ownership by sid cookie
 * - verifies line belongs to cart
 * - de-dupes by unique target [cartLineId, key] (DB index required)
 */

function jsonNoStore(req: NextRequest, body: any, status = 200) {
  const rid = body?.requestId || req.headers.get("x-request-id") || crypto.randomUUID();
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": String(rid),
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
    },
  });
}

const COOKIE_OPTS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
};

function getSidFromRequest(req: NextRequest): string {
  return req.cookies.get("adap_sid")?.value ?? req.cookies.get("sid")?.value ?? "";
}

function setSid(res: NextResponse, sid: string) {
  res.cookies.set("adap_sid", sid, COOKIE_OPTS);
  res.cookies.set("sid", sid, COOKIE_OPTS);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Used when client only sends one of key/url. */
const R2_PUBLIC_BASEURL =
  (process.env.R2_PUBLIC_BASEURL ?? process.env.R2_PUBLIC_BASE_URL ?? "").trim();

/** From storageId (url or key) → { key, url } aligned to CDN delivery. */
function fromStorageId(storageIdRaw: string) {
  const storageId = storageIdRaw.trim();
  const looksLikeUrl = /^https?:\/\//i.test(storageId);

  if (looksLikeUrl) {
    if (R2_PUBLIC_BASEURL) {
      try {
        const base = R2_PUBLIC_BASEURL.endsWith("/") ? R2_PUBLIC_BASEURL : `${R2_PUBLIC_BASEURL}/`;
        const u = new URL(storageId);
        const b = new URL(base);
        if (u.origin === b.origin && u.pathname.startsWith(b.pathname)) {
          const key = u.pathname.slice(b.pathname.length).replace(/^\/+/, "");
          return { key, url: storageId };
        }
      } catch {
        /* ignore */
      }
    }

    try {
      const u = new URL(storageId);
      const key = u.pathname.replace(/^\/+/, "");
      return { key, url: storageId };
    } catch {
      /* ignore */
    }
  }

  const key = storageId.replace(/^\/+/, "");
  const base = R2_PUBLIC_BASEURL
    ? R2_PUBLIC_BASEURL.endsWith("/")
      ? R2_PUBLIC_BASEURL
      : `${R2_PUBLIC_BASEURL}/`
    : "";
  const url = base ? new URL(key, base).toString() : "";
  return { key, url };
}

function filenameFrom(pathOrUrl: string): string {
  try {
    const u = new URL(pathOrUrl);
    return u.pathname.split("/").filter(Boolean).pop() || "upload.pdf";
  } catch {
    return pathOrUrl.split("/").filter(Boolean).pop() || "upload.pdf";
  }
}

/** Client may send parts in any of these shapes. */
type ClientPart =
  | { key: string; url: string; fileName?: string }
  | { storageId: string; fileName?: string }
  | { key: string; publicUrl: string; fileName?: string };

type ClientCartLine = { id?: string; lineId?: string; quantity?: number };

const BodySchema = z
  .object({
    productId: z.union([z.number(), z.string()]),
    cartLines: z.array(z.object({ id: z.any().optional(), lineId: z.any().optional() })).min(1),
    parts: z.array(z.any()).min(1),
  })
  .strict();

export async function POST(req: NextRequest) {
  const rid = req.headers.get("x-request-id") || crypto.randomUUID();

  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonNoStore(
        req,
        {
          ok: false,
          requestId: rid,
          error: "invalid_body",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400
      );
    }

    // productId is accepted for compatibility, but NOT written to cart_attachments in this route.
    const productId = Number(parsed.data.productId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return jsonNoStore(req, { ok: false, requestId: rid, error: "productId is required (number)" }, 400);
    }

    const cartLinesIn = parsed.data.cartLines as ClientCartLine[];

    // Normalize line IDs (accept {id} or {lineId})
    const lineIds = cartLinesIn
      .map((l) => String((l.lineId ?? l.id ?? "")).trim())
      .filter(isNonEmptyString);

    if (lineIds.length === 0) {
      return jsonNoStore(req, { ok: false, requestId: rid, error: "No valid cart line IDs provided" }, 400);
    }

    // Normalize parts → { key, url, fileName }
    const partsIn = parsed.data.parts as ClientPart[];

    const normalizedParts = partsIn
      .map((p: any) => {
        const directKey = typeof p?.key === "string" ? p.key.trim() : "";
        const directUrl =
          typeof p?.url === "string"
            ? p.url.trim()
            : typeof p?.publicUrl === "string"
              ? p.publicUrl.trim()
              : "";

        let key = directKey || "";
        let url = directUrl || "";

        if ((!key || !url) && typeof p?.storageId === "string" && p.storageId.trim()) {
          const derived = fromStorageId(p.storageId);
          key = key || derived.key;
          url = url || derived.url;
        }

        if (!key) return null;

        if (!url && R2_PUBLIC_BASEURL) {
          const base = R2_PUBLIC_BASEURL.endsWith("/") ? R2_PUBLIC_BASEURL : `${R2_PUBLIC_BASEURL}/`;
          url = new URL(key.replace(/^\/+/, ""), base).toString();
        }

        if (!url) return null;

        const fileName =
          (typeof p?.fileName === "string" && p.fileName.trim()) || filenameFrom(url || key);

        return { key, url, fileName: String(fileName).slice(0, 255) };
      })
      .filter(Boolean) as Array<{ key: string; url: string; fileName: string }>;

    if (normalizedParts.length === 0) {
      return jsonNoStore(req, { ok: false, requestId: rid, error: "No valid parts provided" }, 400);
    }

    // Ensure session & open cart
    let sid = getSidFromRequest(req);
    if (!sid) sid = crypto.randomUUID();

    const [cart] = await db
      .select({ id: carts.id })
      .from(carts)
      .where(and(eq(carts.sid, sid), eq(carts.status, "open")))
      .limit(1);

    if (!cart) {
      const res = jsonNoStore(req, { ok: false, requestId: rid, error: "cart_not_found" }, 404);
      setSid(res, sid);
      return res;
    }

    // Verify all provided lines belong to this cart
    const existingLines = await db
      .select({ id: cartLines.id })
      .from(cartLines)
      .where(and(eq(cartLines.cartId, cart.id), inArray(cartLines.id, lineIds)));

    const okSet = new Set(existingLines.map((r) => String(r.id)));
    const missing = lineIds.filter((id) => !okSet.has(String(id)));

    if (missing.length) {
      const res = jsonNoStore(
        req,
        { ok: false, requestId: rid, error: `line(s) not found in this cart: ${missing.join(", ")}` },
        404
      );
      setSid(res, sid);
      return res;
    }

    // Attach to the FIRST line (matches current UI flow)
    const targetCartLineId = lineIds[0];

    // De-dupe by (cartLineId, key) in-process (DB also enforces via unique index)
    const seen = new Set<string>();

    // IMPORTANT: only include columns that exist on cart_attachments.
    // From your Drizzle typings, required: cartLineId, key, url. Optional: fileName, kind, contentType, meta, etc.
    const rows = normalizedParts
      .map((p) => {
        const dedupeKey = `${targetCartLineId}::${p.key}`;
        if (seen.has(dedupeKey)) return null;
        seen.add(dedupeKey);

        return {
          cartLineId: targetCartLineId,
          key: p.key,
          url: p.url,
          // Drizzle typing indicates optional (undefined ok) not nullable (null not ok)
// sourcery skip: simplify-ternary
          fileName: p.fileName ? p.fileName : undefined,
        };
      })
      .filter(Boolean) as Array<{
      cartLineId: string;
      key: string;
      url: string;
      fileName?: string;
    }>;

    if (rows.length === 0) {
      const res = jsonNoStore(req, { ok: true, requestId: rid, attached: 0, attempted: 0, skipped: 0 }, 200);
      setSid(res, sid);
      return res;
    }

    const inserted = await db
      .insert(cartAttachments)
      .values(rows)
      .onConflictDoNothing({
        target: [cartAttachments.cartLineId, cartAttachments.key],
      })
      .returning({ id: cartAttachments.id });

    const res = jsonNoStore(
      req,
      {
        ok: true,
        requestId: rid,
        attached: inserted.length,
        attempted: rows.length,
        skipped: rows.length - inserted.length,
      },
      200
    );

    setSid(res, sid);
    return res;
  } catch (e: any) {
    console.error("[/api/cart/attachments] error:", e?.message, e?.stack);
    return jsonNoStore(req, { ok: false, requestId: rid, error: e?.message || "Failed to save attachments" }, 500);
  }
}

export async function GET(req: NextRequest) {
  const rid = req.headers.get("x-request-id") || crypto.randomUUID();
  return jsonNoStore(req, { ok: false, requestId: rid, error: "Method Not Allowed. Use POST." }, 405);
}
