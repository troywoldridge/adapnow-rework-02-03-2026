import "server-only";

import { NextResponse } from "next/server";
import { scanAndSendArtworkNeededEmails } from "@/lib/artwork/artworkNeeded";

function readSecret(req: Request): string {
  return (
    req.headers.get("x-job-secret") ||
    req.headers.get("x-cron-secret") ||
    ""
  ).trim();
}

function expectedSecret(): string {
  return (
    process.env.CRON_SECRET ||
    process.env.JOB_SECRET ||
    ""
  ).trim();
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const need = expectedSecret();
  if (!need) {
    return NextResponse.json(
      { ok: false, error: "Missing CRON_SECRET/JOB_SECRET env" },
      { status: 500 }
    );
  }

  const got = readSecret(req);
  if (!got || got !== need) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {}

  const lookbackHours = Number.isFinite(Number(body?.lookbackHours))
    ? Number(body.lookbackHours)
    : 72;

  const limit = Number.isFinite(Number(body?.limit))
    ? Number(body.limit)
    : 50;

  const result = await scanAndSendArtworkNeededEmails({ lookbackHours, limit });
  return NextResponse.json(result);
}
