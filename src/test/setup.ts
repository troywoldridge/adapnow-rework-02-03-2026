import { vi } from "vitest";

/**
 * Next.js "server-only" throws outside Next runtime.
 * In unit/integration tests we treat it as a no-op.
 */
vi.mock("server-only", () => ({}));
