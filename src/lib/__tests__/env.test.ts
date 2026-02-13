// Unit tests for env module
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("env", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("requireDatabaseUrl throws when DATABASE_URL is not set", async () => {
    const orig = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    process.env.POSTGRES_URL = "";
    process.env.NEON_URL = "";

    const { requireDatabaseUrl } = await import("@/lib/env");
    expect(() => requireDatabaseUrl()).toThrow(/DATABASE_URL/);

    process.env.DATABASE_URL = orig;
  });

  it("requireDatabaseUrl returns URL when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/test";

    const { requireDatabaseUrl } = await import("@/lib/env");
    expect(requireDatabaseUrl()).toBe("postgresql://localhost:5432/test");
  });

  it("getEnv returns expected shape", async () => {
    process.env.DATABASE_URL = "postgresql://x";
    process.env.NEXT_PUBLIC_STORE_CODE = "en_ca";

    const { getEnv } = await import("@/lib/env");
    const e = getEnv();

    expect(e).toHaveProperty("DATABASE_URL");
    expect(e).toHaveProperty("SINALITE_BASE_URL");
    expect(e).toHaveProperty("SINALITE_AUTH_URL");
    expect(e).toHaveProperty("NEXT_PUBLIC_STORE_CODE");
    expect(e.NEXT_PUBLIC_STORE_CODE).toBe("en_ca");
  });
});
