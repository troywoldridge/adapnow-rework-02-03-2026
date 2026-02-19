import "server-only";

import { POST as handlePOST } from "@/app/api/uploads/r2/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  return handlePOST(req as any);
}
