import "server-only";

/**
 * DEPRECATED:
 * Use `enforcePolicy(req, "admin")` from src/lib/auth.ts instead.
 *
 * This exists only to prevent churn while migrating routes.
 * Remove later once all imports are updated.
 */
import { enforcePolicy } from "@/lib/auth";

export async function requireAdmin(req: Request) {
  return enforcePolicy(req, "admin");
}
