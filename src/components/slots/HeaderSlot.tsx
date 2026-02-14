import "server-only";

import Header from "@/components/Header";

/**
 * HeaderSlot (Server Component)
 * Keeps the layout composition clean.
 *
 * Note:
 * - Header is currently a Client Component; this server slot simply renders it.
 * - If you want a Suspense fallback, do it in layout.tsx so it's consistent with the rest of the shell.
 */
export default function HeaderSlot() {
  return <Header />;
}
