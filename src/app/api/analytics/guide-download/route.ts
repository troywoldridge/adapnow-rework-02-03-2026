import "server-only";

import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

declare global {
  // eslint-disable-next-line no-var
  var __adapPgPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global.__adapPgPool) {
    const cs = process.env.DATABASE_URL;
    if (!cs) throw new Error("Missing DATABASE_URL");
    global.__adapPgPool = new Pool({ connectionString: cs });
  }
  return global.__adapPgPool;
}

function s(v: unknown, max = 4000): string {
  const out = String(v ?? "").trim();
  if (!out) return "";
  return out.length > max ? out.slice(0, max) : out;
}

function n(v: unknown, def = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
}

function ipFromHeaders(h: Headers): string {
  const xff = h.get("x-forwarded-for") || "";
  if (xff) return xff.split(",")[0].trim();
  const real = h.get("x-real-ip") || "";
  return real.trim();
}

export async function POST(req: Request) {
  // Support both sendBeacon (application/json) and fetch
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const href = s(body?.href, 1200);
  const label = s(body?.label, 400);
  const categoryPath = s(body?.categoryPath, 600);
  const sizeBytes = Math.max(0, Math.floor(n(body?.sizeBytes, 0)));

  if (!href || !label || !categoryPath) {
    // For analytics, do not error hard
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const ua = s(req.headers.get("user-agent") || "", 800);
  const ip = s(ipFromHeaders(req.headers as any), 120);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `
      INSERT INTO guide_download_events (href, label, category_path, size_bytes, user_agent, ip)
      VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [href, label, categoryPath, sizeBytes, ua || null, ip || null]
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    // Never block downloads because analytics failed
    return NextResponse.json({ ok: true }, { status: 200 });
  } finally {
    client.release();
  }
}
