import "server-only";

import * as React from "react";
import { Suspense } from "react";

/**
 * Next.js requirement:
 * Any subtree that uses `useSearchParams()` must be wrapped in a Suspense boundary
 * from a SERVER component (not a client layout).
 *
 * This layout makes the entire /account segment safe for CSR bailout.
 * Ref: https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

function AccountSegmentFallback() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="h-7 w-56 rounded bg-gray-100" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-gray-100" />
        <div className="mt-8 grid gap-3">
          <div className="h-10 rounded bg-gray-100" />
          <div className="h-10 rounded bg-gray-100" />
          <div className="h-10 rounded bg-gray-100" />
        </div>
      </div>
    </main>
  );
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<AccountSegmentFallback />}>{children}</Suspense>;
}
