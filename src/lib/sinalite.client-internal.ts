// src/lib/sinalite.client-internal.ts
/**
 * Internal (server-only) re-exports for Sinalite client utilities.
 *
 * Keep this file as a stable import target for any modules that need
 * access to env-based configuration or low-level fetch helpers without
 * creating circular deps.
 */
import "server-only";

export { env as sinaliteEnv, apiFetchJson, buildUrl } from "@/lib/sinalite.client";
