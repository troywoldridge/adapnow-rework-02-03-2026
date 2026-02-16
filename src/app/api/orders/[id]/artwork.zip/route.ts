// src/app/api/orders/[id]/artwork.zip/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { eq, inArray } from "drizzle-orm";
import archiver from "archiver";
import { Readable } from "node:stream";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";
import { cartLines } from "@/lib/db/schema/cartLines";
import { cartArtwork } from "@/lib/db/schema/cartArtwork";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

// Next 14 (sync) + Next 15 (async) cookies helper
async function getCookieJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

function safeFileExtFromUrl(url: string): string {
  const base = url.split("?")[0].split("#")[0];
  const ext = base.split(".").pop()?.toLowerCase() || "bin";
  // keep it conservative
  if (!/^[a-z0-9]{1,8}$/.test(ext)) return "bin";
  return ext;
}

function safeZipNamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

/**
 * Optional URL allowlist:
 * If you only ever store artwork on your CDN, set R2_PUBLIC_BASEURL (or R2_PUBLIC_BASE_URL)
 * and we'll prefer allowing only that origin. If not set, we allow any absolute https? URL.
 */
function isAllowedArtworkUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;

  const base =
    (process.env.R2_PUBLIC_BASEURL ||
      process.env.R2_PUBLIC_BASE_URL ||
      "").trim();

  if (!base) return true;

  try {
    const b = new URL(base.endsWith("/") ? base : `${base}/`);
    return u.origin === b.origin && u.pathname.startsWith(b.pathname);
  } catch {
    // bad base => don't block downloads
    return true;
  }
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        // a little nicer for some CDNs
        accept: "application/pdf,application/octet-stream,*/*",
      },
    });
  } finally {
    clearTimeout(t);
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const database = db;
    const { userId } = await auth();

    const jar = await getCookieJar();
    const sid = jar.get("adap_sid")?.value ?? jar.get("sid")?.value ?? null;

    const orderId = String(params?.id || "").trim();
    if (!orderId) return noStoreJson({ ok: false, error: "missing_order_id" }, 400);

    const [o] =
      (await database.select().from(orders).where(eq(orders.id, orderId)).limit(1)) ?? [];

    if (!o) return noStoreJson({ ok: false, error: "not_found" }, 404);

    // Claim guest → user if possible (same behavior as your other routes)
    if (userId && (o as any).userId === sid) {
      await database.update(orders).set({ userId }).where(eq(orders.id, orderId));
      (o as any).userId = userId;
    }

    // Authorization: order owner must match clerk user or guest sid
    const owner = (o as any).userId ?? null;
    if (![userId, sid].filter(Boolean).includes(owner)) {
      return noStoreJson({ ok: false, error: "forbidden" }, 403);
    }

    const cartId = (o as any).cartId ? String((o as any).cartId) : "";
    if (!cartId) {
      // No cart attached => no artwork
      return noStoreJson({ ok: true, count: 0, error: "no_cart_id" }, 200);
    }

    const lineRows =
      (await database
        .select({ id: cartLines.id })
        .from(cartLines)
        .where(eq(cartLines.cartId, cartId))) ?? [];

    const lineIds = lineRows.map((l) => String(l.id)).filter(Boolean);

    const arts =
      lineIds.length > 0
        ? await database
            .select({
              cartLineId: cartArtwork.cartLineId,
              url: cartArtwork.url,
            })
            .from(cartArtwork)
            .where(inArray(cartArtwork.cartLineId as any, lineIds as any))
        : [];

    // If nothing to zip, return an empty zip (still useful UX) or a json — choose zip for compatibility.
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("warning", (err: Error & { code?: string }) => {
      // archiver uses ENOENT for missing appended files; we don't want to crash the whole zip.
      if ((err as any).code === "ENOENT") {
        console.warn("[artwork.zip] zip warning:", err.message);
        return;
      }
      throw err;
    });

    archive.on("error", (err: Error) => {
      throw err;
    });

    // Safety limits so a weird order can't blow memory/time
    const MAX_FILES = 40;
    const PER_FILE_TIMEOUT_MS = 15_000;

    let idx = 1;
    for (const a of arts) {
      if (idx > MAX_FILES) break;

      const url = typeof (a as any)?.url === "string" ? (a as any).url.trim() : "";
      if (!url) continue;
      if (!isAllowedArtworkUrl(url)) continue;

      try {
        const res = await fetchWithTimeout(url, PER_FILE_TIMEOUT_MS);
        if (!res.ok || !res.body) continue;

        const ext = safeFileExtFromUrl(url);
        const name = `artwork_${String(idx).padStart(2, "0")}.${ext}`;

        // Convert fetch body to Node stream for archiver
        const nodeReadable = Readable.fromWeb(res.body as any);
        archive.append(nodeReadable, { name });
        idx++;
      } catch (e) {
        console.warn("[artwork.zip] skipping artwork due to fetch/stream error:", e);
      }
    }

    // Start finalizing immediately; we stream as it generates
    void archive.finalize();

    const orderNumber =
      (o as any).orderNumber != null ? String((o as any).orderNumber) : String((o as any).id).slice(0, 8);

    const filename = `order_${safeZipNamePart(orderNumber)}_artwork.zip`;

    const webStream = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    });
  } catch (e: any) {
    console.error("[artwork.zip] failed", e);
    return noStoreJson({ ok: false, error: String(e?.message || e) }, 500);
  }
}
