/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { customerAddresses } from "@/lib/db/schema/customerAddresses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function noStoreJson(req: NextRequest, body: any, status = 200) {
  const requestId = body?.requestId || getRequestId(req);
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

const BodySchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    firstName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
    company: z.string().trim().max(120).optional(),
    street1: z.string().trim().min(1).max(200),
    street2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().min(1).max(80),
    zip: z.string().trim().min(1).max(30),
    country: z.string().trim().min(2).max(2),
  })
  .strict();

function ownerColumn() {
  const col = (customerAddresses as any).customerId ?? (customerAddresses as any).userId;
  return col as any;
}

function normalizeCountry(code: string): string {
  return code.trim().toUpperCase();
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const { userId } = await auth();
    if (!userId) return noStoreJson(req, { ok: false as const, requestId, error: "auth_required" }, 401);

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_body",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400,
      );
    }

    const body = parsed.data;
    const id = body.id?.trim() || null;
    const firstName = body.firstName?.trim() || "";
    const lastName = body.lastName?.trim() || "";
    const company = body.company?.trim() || "";
    const line1 = body.street1.trim();
    const line2 = body.street2?.trim() || null;
    const city = body.city.trim();
    const state = body.state.trim();
    const postal = body.zip.trim();
    const country = normalizeCountry(body.country);
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const name = (company || fullName || "Address").slice(0, 120);
    const ownerId = userId;
    const ownerCol = ownerColumn();

    if (id) {
      const existing = await (db as any).query.customerAddresses.findFirst({
        where: and(eq((customerAddresses as any).id, id), eq(ownerCol, ownerId)),
      });

      if (!existing) {
        return noStoreJson(req, { ok: false as const, requestId, error: "address_not_found" }, 404);
      }

      await db
        .update(customerAddresses)
        .set({
          name,
          line1,
          line2,
          city,
          state,
          postalCode: postal,
          country,
          updatedAt: new Date(),
        } as any)
        .where(and(eq((customerAddresses as any).id, id), eq(ownerCol, ownerId)) as any);

      return noStoreJson(req, { ok: true as const, requestId, id }, 200);
    }

    const insertValues: any = {
      name,
      line1,
      line2,
      city,
      state,
      postalCode: postal,
      country,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if ((customerAddresses as any).customerId) {
      insertValues.customerId = ownerId;
    } else if ((customerAddresses as any).userId) {
      insertValues.userId = ownerId;
    } else {
      return noStoreJson(req, { ok: false as const, requestId, error: "schema_missing_owner_column" }, 500);
    }

    const [row] = await db
      .insert(customerAddresses)
      .values(insertValues)
      .returning({ id: (customerAddresses as any).id });

    const newId = row?.id ?? null;
    if (!newId) {
      return noStoreJson(req, { ok: false as const, requestId, error: "insert_failed" }, 500);
    }

    return noStoreJson(req, { ok: true as const, requestId, id: newId }, 200);
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "server_error");
    console.error("[/api/account/address/upsert POST] failed:", msg);
    return noStoreJson(req, { ok: false as const, requestId, error: msg }, 500);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed. Use POST." }, 405);
}
