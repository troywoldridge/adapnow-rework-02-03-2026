import "server-only";

import RouteProgress from "@/components/RouteProgress";

/**
 * RouteProgressSlot (Server Component)
 * - Renders the client-side NProgress hook component.
 * - Suspense is unnecessary here because RouteProgress doesn't suspend.
 */
export default function RouteProgressSlot() {
  return <RouteProgress />;
}
