// src/app/account/orders/[id]/invoice/email/shared.ts
import "server-only";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";
import { cartLines } from "@/lib/db/schema/cartLines";

type OrderRow = typeof orders.$inferSelect;

export type InvoiceEmailLine = {
  id: string;
  productId: number | string;
  quantity: number | string;
  unitPriceCents: number | string | null;
  lineTotalCents: number | string | null;
  optionIds?: (number | string)[] | null;
};

function cleanId(s: unknown): string {
  return String(s ?? "").trim();
}

export async function loadOrderForInvoiceEmail(orderIdRaw: string): Promise<{
  order: OrderRow;
  lines: InvoiceEmailLine[];
  currency: "USD" | "CAD";
} | null> {
  const orderId = cleanId(orderIdRaw);
  if (!orderId) return null;

  const { userId } = await auth();

  // In your project typings, cookies() is Promise-like — await it.
  const jar = await cookies();
  const sid = jar.get("adap_sid")?.value ?? jar.get("sid")?.value ?? null;

  const order =
    ((await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))?.[0] as
      | OrderRow
      | undefined) ?? null;

  if (!order) return null;

  const orderOwner = String((order as any).userId ?? "");

  // Guest → user claim (only if order currently owned by sid)
  if (userId && sid && orderOwner === String(sid)) {
    await db.update(orders).set({ userId }).where(eq(orders.id, orderId));
    (order as any).userId = userId;
  }

  // Ownership check after potential claim
  const updatedOwner = String((order as any).userId ?? "");
  const claimants = [userId, sid].filter(Boolean).map(String);
  if (!claimants.includes(updatedOwner)) return null;

  const cartId = cleanId((order as any).cartId as string | null);
  const lines: InvoiceEmailLine[] = cartId
    ? ((await db
        .select({
          id: cartLines.id,
          productId: cartLines.productId,
          quantity: cartLines.quantity,
          unitPriceCents: cartLines.unitPriceCents,
          lineTotalCents: cartLines.lineTotalCents,
          optionIds: cartLines.optionIds,
        })
        .from(cartLines)
        .where(eq(cartLines.cartId, cartId))) as unknown as InvoiceEmailLine[])
    : [];

  const currency: "USD" | "CAD" = (order as any).currency === "CAD" ? "CAD" : "USD";

  return { order, lines, currency };
}
