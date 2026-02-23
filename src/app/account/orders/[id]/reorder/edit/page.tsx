// src/app/account/orders/[id]/reorder/edit/page.tsx
import "server-only";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";
import { cartLines } from "@/lib/db/schema/cartLines";

import ReorderEditor from "./ReorderEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type OrderRow = typeof orders.$inferSelect;

type LineRow = {
  id: string;
  productId: number | string;
  quantity: number | string;
  unitPriceCents: number | string | null;
  lineTotalCents: number | string | null;
  optionIds: (number | string)[] | null;
};

function cleanId(s: unknown): string {
  return String(s ?? "").trim();
}

/* ------------------------------ SEO (PRIVATE PAGE) ------------------------------ */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Reorder | American Design And Printing",
    description: "Adjust quantities and add items from a prior order to your cart.",
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
        "max-image-preview": "none",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

async function loadProductMeta(
  productIds: number[]
): Promise<Record<number, { name?: string | null; sku?: string | null }>> {
  const ids = Array.from(new Set(productIds.filter((n) => Number.isFinite(n) && n > 0)));
  if (!ids.length) return {};

  const result = (await db.execute(
    sql`SELECT product_id, name, sku
        FROM sinalite_products
        WHERE product_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`
  )) as any;

  const rows: any[] = Array.isArray(result?.rows) ? result.rows : Array.isArray(result) ? result : [];

  const out: Record<number, { name?: string | null; sku?: string | null }> = {};
  for (const r of rows) {
    const pid = Number(r?.product_id);
    if (!Number.isFinite(pid)) continue;
    out[pid] = {
      name: r?.name ?? null,
      sku: r?.sku ?? null,
    };
  }
  return out;
}

async function load(orderIdRaw: string) {
  const orderId = cleanId(orderIdRaw);
  if (!orderId) return null;

  const { userId } = await auth();

  const jar = await cookies();
  const sid = jar.get("adap_sid")?.value ?? jar.get("sid")?.value ?? null;

  const { select, update } = db;

  const o =
    ((await select().from(orders).where(eq(orders.id, orderId)).limit(1))?.[0] as OrderRow | undefined) ??
    null;

  if (!o) return null;

  // Guest → user claim
  if (userId && sid && String((o as any).userId) === String(sid)) {
    await update(orders).set({ userId }).where(eq(orders.id, orderId));
    (o as any).userId = userId;
  }

  // Ownership check
  const claimants = [userId, sid].filter(Boolean) as string[];
  if (!claimants.includes(String((o as any).userId))) return null;

  const cartId = ((o as any).cartId as string | null) ?? null;

  const lines: LineRow[] = cartId
    ? ((await select({
        id: cartLines.id,
        productId: cartLines.productId,
        quantity: cartLines.quantity,
        unitPriceCents: cartLines.unitPriceCents,
        lineTotalCents: cartLines.lineTotalCents,
        optionIds: cartLines.optionIds,
      })
        .from(cartLines)
        .where(eq(cartLines.cartId, cartId))) as unknown as LineRow[])
    : [];

  const currency: "USD" | "CAD" = (o as any).currency === "CAD" ? "CAD" : "USD";

  const productIds = lines
    .map((l) => Number((l as any).productId))
    .filter((n) => Number.isFinite(n) && n > 0);

  const productMeta = await loadProductMeta(productIds);

  // Only send what the editor needs (keep it tight & future-proof)
  const editorLines = lines.map((l) => ({
    productId: Number((l as any).productId) || 0,
    quantity: Number((l as any).quantity) || 0,
    unitPriceCents:
      (l as any).unitPriceCents === null || (l as any).unitPriceCents === undefined
        ? null
        : Number((l as any).unitPriceCents) || 0,
  }));

  return { orderId, currency, lines: editorLines, productMeta };
}

export default async function Page({
  params,
}: {
  // Your build's PageProps constraint expects Promise-like params.
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await (params as unknown as Promise<{ id: string }>);
  const data = await load(resolvedParams.id);
  if (!data) notFound();
  return <ReorderEditor {...data} />;
}
