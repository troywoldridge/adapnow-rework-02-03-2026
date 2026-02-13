// src/app/api/health/route.ts
// Health check for DB (and optional Sinalite connectivity).

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type HealthStatus = {
  ok: boolean;
  db?: "ok" | "error";
  dbError?: string;
  sinalite?: "ok" | "skip" | "error";
  sinaliteError?: string;
};

export async function GET() {
  const status: HealthStatus = { ok: true };

  try {
    await db.execute(sql`SELECT 1`);
    status.db = "ok";
  } catch (e) {
    status.ok = false;
    status.db = "error";
    status.dbError = e instanceof Error ? e.message : String(e);
  }

  const env = getEnv();
  if (env.SINALITE_BASE_URL) {
    try {
      const res = await fetch(`${env.SINALITE_BASE_URL}/health`, {
        method: "HEAD",
        signal: AbortSignal.timeout(3000),
      });
      status.sinalite = res.ok ? "ok" : "error";
      if (!res.ok) status.sinaliteError = `HTTP ${res.status}`;
    } catch (e) {
      status.sinalite = "error";
      status.sinaliteError = e instanceof Error ? e.message : String(e);
      // Sinalite is optional; do not fail overall health
    }
  } else {
    status.sinalite = "skip";
  }

  const statusCode = status.ok ? 200 : 503;
  return NextResponse.json(status, {
    status: statusCode,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}
