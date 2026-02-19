import "server-only";

import { GET as handleGET, POST as handlePOST } from "@/app/api/sessions/ensure/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  return handleGET(req as any);
}

export async function POST(req: Request) {
  return handlePOST(req as any);
}
