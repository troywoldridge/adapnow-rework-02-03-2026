// src/app/api/cart/attachments/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, inArray, sql } from "drizzle-orm";
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
 *   productId: number,
 *   cartLines: [{ id?: string, lineId?: string }],
 *   parts: ClientPart[]
 * }
 *
 * Safety / future-proofing:
 * - no-store + requestId
 * - robust parsing + normalization
 * - verifies cart ownership by sid cookie
 * - verifies line belongs to cart
 * - de-dupes by unique target [lineId, key] (DB index required)
 * - DOES NOT create carts/lines (should already exist)
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

async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

async function readSid(): Promise<string | undefined> {
  const jar = await getJar();
  return jar?.get?.("adap_sid")?.value ?? jar?.get?.("sid")?.value;
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

/** From storageId (url or key) → { key, url } aligned to Cloudflare CDN delivery. */
function fromStorageId(storageIdRaw: string) {
  const storageId = storageIdRaw.trim();
  const looksLikeUrl = /^https?:\/\//i.test(storageId);

  if (looksLikeUrl) {
    // If base is known and url is under it, key = path relative to base path
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

    // Fallback: key = url pathname (no leading slash)
    try {
      const u = new URL(storageId);
      const key = u.pathname.replace(/^\/+/, "");
      return { key, url: storageId };
    } catch {
      /* ignore */
    }
  }

  // It's a key
  const key = storageId.replace(/^\/+/, "");
  const base = R2_PUBLIC_BASEURL ? (R2_PUBLIC_BASEURL.endsWith("/") ? R2_PUBLIC_BASEURL : `${R2_PUBLIC_BASEURL}/`) : "";
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

        // If url missing but we have R2 base, construct it
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
    let sid = await readSid();
    if (!sid) sid = crypto.randomUUID();

    const cart = await db.query.carts.findFirst({
      where: and(eq(carts.sid, sid), eq(carts.status, "open")),
    });

    if (!cart) {
      const res = jsonNoStore(req, { ok: false, requestId: rid, error: "cart_not_found" }, 404);
      setSid(res, sid);
      return res;
    }

    // Verify all provided lines belong to this cart
    const existingLines = await db.query.cartLines.findMany({
      where: and(eq(cartLines.cartId, cart.id), inArray(cartLines.id, lineIds)),
      columns: { id: true },
    });

    const okSet = new Set(existingLines.map((r: any) => String(r.id)));
    const missing = lineIds.filter((id) => !okSet.has(String(id)));

    if (missing.length) {
      return jsonNoStore(
        req,
        { ok: false, requestId: rid, error: `line(s) not found in this cart: ${missing.join(", ")}` },
        404
      );
    }

    // Attach to the FIRST line (matches current UI flow)
    const targetLineId = lineIds[0];

    // De-dupe by (lineId, key) in-process (DB also enforces via unique index)
    const seen = new Set<string>();
    const now = new Date();

    const rows = normalizedParts
      .map((p) => {
        const dedupeKey = `${targetLineId}::${p.key}`;
        if (seen.has(dedupeKey)) return null;
        seen.add(dedupeKey);

        return {
          cartId: cart.id,
          lineId: targetLineId,
          productId,
          fileName: p.fileName,
          key: p.key,
          url: p.url,
          createdAt: now,
          updatedAt: now,
        };
      })
      .filter(Boolean) as Array<{
      cartId: string;
      lineId: string;
      productId: number;
      fileName: string;
      key: string;
      url: string;
      createdAt: Date;
      updatedAt: Date;
    }>;

    if (rows.length === 0) {
      const res = jsonNoStore(req, { ok: true, requestId: rid, attached: 0, attempted: 0, skipped: 0 }, 200);
      setSid(res, sid);
      return res;
    }

    // Insert and ignore conflicts on unique (lineId, key)
    const inserted = await db
      .insert(cartAttachments)
      .values(rows)
      .onConflictDoNothing({
        target: [cartAttachments.lineId, cartAttachments.key],
      })
      .returning({ id: cartAttachments.id });

    // Optional hygiene (safe, but keep light):
    // If you trust the unique constraint, you can remove this cleanup query.
    await db.execute(sql`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY line_id, key ORDER BY id) AS rn
        FROM cart_attachments
      )
      DELETE FROM cart_attachments
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `);

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
