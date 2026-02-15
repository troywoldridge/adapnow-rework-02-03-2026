// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isAccountRoute = createRouteMatcher(["/account(.*)"]);
const isApiRoute = createRouteMatcher(["/api(.*)", "/trpc(.*)"]);

function ensureRequestId(req: Request): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  return crypto.randomUUID();
}

function maybeRedirectCanonical(req: Request): NextResponse | null {
  const url = new URL(req.url);
  const path = url.pathname;

  // Redirect /category -> /categories and /category/... -> /categories/...
  if (path === "/category" || path.startsWith("/category/")) {
    url.pathname = path.replace(/^\/category(\/|$)/, "/categories$1");
    return NextResponse.redirect(url, 308);
  }

  // Redirect /product -> /products and /product/... -> /products/...
  if (path === "/product" || path.startsWith("/product/")) {
    url.pathname = path.replace(/^\/product(\/|$)/, "/products$1");
    return NextResponse.redirect(url, 308);
  }

  return null;
}

export default clerkMiddleware(async (auth, req) => {
  const requestId = ensureRequestId(req);

  // ✅ First: canonical redirects (cheap + prevents 404s from old links)
  const redirected = maybeRedirectCanonical(req);
  if (redirected) return redirected;

  // Protect account routes
  if (isAccountRoute(req)) {
    await auth.protect();
  }

  // Propagate request-id header for API routes
  if (isApiRoute(req)) {
    const headers = new Headers(req.headers);
    headers.set("x-request-id", requestId);

    const res = NextResponse.next({
      request: { headers },
    });

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
