// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isAccountRoute = createRouteMatcher(["/account(.*)"]);
const isApiRoute = createRouteMatcher(["/api(.*)", "/trpc(.*)"]);

function ensureRequestId(req: Request): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  // Edge runtime supports crypto.randomUUID()
  return crypto.randomUUID();
}

export default clerkMiddleware(async (auth, req) => {
  const requestId = ensureRequestId(req);

  // Protect account routes
  if (isAccountRoute(req)) {
    await auth.protect();
  }

  // Propagate request-id header for API routes (and generally helpful everywhere)
  if (isApiRoute(req)) {
    const headers = new Headers(req.headers);
    headers.set("x-request-id", requestId);

    const res = NextResponse.next({
      request: { headers },
    });

    // Also echo back for clients/log correlation
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // Non-api: just continue (still echo request id as response header)
  const res = NextResponse.next();
  res.headers.set("x-request-id", requestId);
  return res;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
