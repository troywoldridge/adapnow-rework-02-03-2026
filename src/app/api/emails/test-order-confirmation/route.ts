import "server-only";

import { NextResponse } from "next/server";
import { sendOrderConfirmationEmail } from "@/lib/email/sendOrderConfirmation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const to = url.searchParams.get("to")?.trim() || "";

    if (!to) {
      return NextResponse.json(
        { ok: false, error: "Missing ?to=email@example.com" },
        { status: 400 }
      );
    }

    const now = new Date();
    const orderId = `TEST-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

    const result = await sendOrderConfirmationEmail({
      to,
      name: "Troy",
      orderId,
      currency: "USD",
      subtotalCents: 4999,
      shippingCents: 899,
      taxCents: 412,
      discountCents: 0,
      creditsCents: 250,
      totalCents: 605?  // placeholder, fixed below
      ,placedAt: now.toISOString(),
      note: "We’ll email a proof (if applicable) and send tracking as soon as it ships.",
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed" },
      { status: 500 }
    );
  }
}
