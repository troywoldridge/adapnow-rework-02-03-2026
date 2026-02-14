import "server-only";

import { NextResponse } from "next/server";
import { setDefaultAddress } from "@/lib/addresses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

async function readJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function PUT(req: Request) {
  try {
    const body = await readJson(req);
    if (!body || typeof body !== "object") return jsonError(400, "Invalid JSON body");

    const kind = body.kind === "billing" ? "billing" : body.kind === "shipping" ? "shipping" : null;
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!kind) return jsonError(400, "kind must be 'shipping' or 'billing'");
    if (!id) return jsonError(400, "id is required");

    await setDefaultAddress(kind, id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Failed to set default address");
  }
}
