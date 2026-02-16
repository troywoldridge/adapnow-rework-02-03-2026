import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema/customer"; // includes clerkUserId
import { loyaltyWallets } from "@/lib/db/schema/loyalty";
import { orders } from "@/lib/db/schema/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function safeEmailFromClerk(userId: string, user: Awaited<ReturnType<typeof currentUser>>): string {
  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    null;

  if (email && typeof email === "string" && email.trim()) return email.trim();
  // Ensure we never pass undefined into a NOT NULL column.
  return `${userId}@users.invalid`;
}

function safeDisplayName(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  const full = typeof user?.fullName === "string" ? user.fullName.trim() : "";
  if (full) return full;

  const first = typeof user?.firstName === "string" ? user.firstName.trim() : "";
  const last = typeof user?.lastName === "string" ? user.lastName.trim() : "";
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || null;
}

export async function GET(_req: NextRequest) {
  try {
    // Use auth() consistently (async) — avoids getAuth sync footguns.
    const { userId } = await auth();
    if (!userId) return jsonError(401, "auth_required");

    // Prefer Clerk's user object for reliable email/name.
    const user = await currentUser();
    const email = safeEmailFromClerk(userId, user);
    const displayName = safeDisplayName(user);

    // Upsert customer by clerkUserId.
    // NOTE: This assumes customers.clerkUserId is unique.
    const [cust] = await db
      .insert(customers)
      .values({
        clerkUserId: userId,
        email,
        displayName,
      } as any)
      .onConflictDoUpdate({
        target: customers.clerkUserId,
        set: {
          email,
          displayName,
          updatedAt: new Date(),
        } as any,
      })
      .returning();

    if (!cust) return jsonError(500, "customer_upsert_failed");

    // Ensure wallet for this customer id.
    let wallet =
      (await db.query.loyaltyWallets.findFirst({
        where: eq(loyaltyWallets.customerId, cust.id),
      })) ?? null;

    if (!wallet) {
      const inserted = await db
        .insert(loyaltyWallets)
        .values({
          customerId: cust.id,
          pointsBalance: 0,
          lifetimeEarned: 0,
          lifetimeRedeemed: 0,
          updatedAt: new Date(),
          createdAt: new Date(),
        } as any)
        .returning();

      wallet = (inserted as any[])?.[0] ?? null;
    }

    // Recent orders (orders.userId is Clerk userId elsewhere in your app).
    const recentOrders = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalCents: orders.totalCents,
        currency: orders.currency,
        placedAt: orders.placedAt,
      })
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.placedAt))
      .limit(5);

    return NextResponse.json({
      ok: true,
      profile: {
        displayName: (cust as any).displayName ?? displayName,
        email: (cust as any).email ?? email,
        marketingOptIn: (cust as any).marketingOptIn ?? null,
      },
      points: Number((wallet as any)?.pointsBalance ?? 0),
      recentOrders,
    });
  } catch (e: any) {
    console.error("GET /api/me/summary failed", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}

// Guard other methods.
export async function POST() {
  return jsonError(405, "method_not_allowed");
}
export const PUT = POST;
export const DELETE = POST;
