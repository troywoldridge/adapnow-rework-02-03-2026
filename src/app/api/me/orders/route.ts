import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/* -------------------------- DB Introspection -------------------------- */

async function tableExists(name: string) {
  const q = sql`SELECT to_regclass(${`public.${name}`}) AS t`;
  const res = await db.execute(q);
  const row = Array.isArray(res) ? (res as any)[0] : (res as any).rows?.[0];
  return !!(row?.t ?? row?.to_regclass);
}

async function columnExists(table: string, column: string) {
  const q = sql`
    SELECT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
    ) AS e
  `;
  const res = await db.execute(q);
  const row = Array.isArray(res) ? (res as any)[0] : (res as any).rows?.[0];
  return !!row?.e;
}

async function firstExistingColumn(table: string, candidates: string[]) {
  for (const c of candidates) {
    if (await columnExists(table, c)) return c;
  }
  return null;
}

/* -------------------------- Orders Query -------------------------- */

const ORDER_COL_CANDIDATES = {
  id: ["id"],
  createdAt: ["created_at", "createdAt", "createdat"],
  status: ["status"],
  currency: ["currency"],
  totalCents: ["total_cents", "totalCents", "amount_total_cents", "amountTotalCents"],
  total: ["total", "amount_total"], // some schemas store dollars or Stripe-like strings
  // Ownership
  owner: ["customer_id", "customerId", "user_id", "userId", "clerk_user_id", "clerkUserId"],
};

function toISO(v: any): string | null {
  if (!v) return null;
  try {
    return new Date(v).toISOString();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return jsonNoStore({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? 25);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 25;

    if (!(await tableExists("orders"))) {
      return jsonNoStore({ ok: true, orders: [] });
    }

    const cols = {
      id: await firstExistingColumn("orders", ORDER_COL_CANDIDATES.id),
      createdAt: await firstExistingColumn("orders", ORDER_COL_CANDIDATES.createdAt),
      status: await firstExistingColumn("orders", ORDER_COL_CANDIDATES.status),
      currency: await firstExistingColumn("orders", ORDER_COL_CANDIDATES.currency),
      totalCents: await firstExistingColumn("orders", ORDER_COL_CANDIDATES.totalCents),
      total: await firstExistingColumn("orders", ORDER_COL_CANDIDATES.total),
      owner: await firstExistingColumn("orders", ORDER_COL_CANDIDATES.owner),
    };

    if (!cols.id) {
      return jsonNoStore({ ok: true, orders: [] });
    }

    // If we can’t identify an ownership column, we cannot safely list “my orders”.
    // In that case, return empty with a hint so you notice it during dev.
    if (!cols.owner) {
      return jsonNoStore({
        ok: true,
        orders: [],
        note:
          'Orders table has no recognizable owner column (tried customer_id/user_id/clerk_user_id). Add one to enable /api/me/orders.',
      });
    }

    const q = sql`
      SELECT
        ${sql.raw(`"${cols.id}"`)}::text AS id,
        ${cols.createdAt ? sql.raw(`"${cols.createdAt}"`) : sql.raw(`NULL`)} AS created_at,
        ${cols.status ? sql.raw(`"${cols.status}"`) : sql.raw(`NULL`)} AS status,
        ${cols.currency ? sql.raw(`"${cols.currency}"`) : sql.raw(`NULL`)} AS currency,
        ${cols.totalCents ? sql.raw(`"${cols.totalCents}"`) : sql.raw(`NULL`)} AS total_cents,
        ${cols.total ? sql.raw(`"${cols.total}"`) : sql.raw(`NULL`)} AS total
      FROM "orders"
      WHERE ${sql.raw(`"${cols.owner}"`)}::text = ${userId}
      ORDER BY ${cols.createdAt ? sql.raw(`"${cols.createdAt}"`) : sql.raw(`1`)} DESC
      LIMIT ${limit}
    `;

    const res = await db.execute(q);
    const rows: any[] = Array.isArray(res) ? (res as any) : (res as any).rows ?? [];

    const orders = rows.map((r) => ({
      id: String(r.id),
      status: r.status ?? null,
      currency: r.currency ?? null,
      createdAt: toISO(r.created_at),
      totalCents: r.total_cents != null ? Number(r.total_cents) : null,
      total: r.total ?? null,
    }));

    return jsonNoStore({ ok: true, orders });
  } catch (e: any) {
    return jsonNoStore({ ok: false, error: String(e?.message || e || "Unknown error") }, 500);
  }
}
