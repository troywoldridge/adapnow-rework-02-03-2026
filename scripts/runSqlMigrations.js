#!/usr/bin/env node
/**
 * scripts/runSqlMigrations.js
 *
 * DEPRECATED — LEGACY ONLY
 * -----------------------------------------
 * This script exists for historical reasons and should NOT be used
 * as the primary migration workflow.
 *
 * Authoritative workflow:
 *   - Use Drizzle migrations via drizzle-kit
 *   - See README.md and docs/migrations-playbook.md
 *
 * If you still need to run legacy SQL for a one-off environment,
 * do so with extreme caution and never in production unless explicitly approved.
 */

console.error(
  [
    "ERROR: scripts/runSqlMigrations.js is deprecated.",
    "Use Drizzle migrations (drizzle-kit) instead.",
    "See README.md and docs/migrations-playbook.md",
  ].join("\n")
);
process.exit(1);
