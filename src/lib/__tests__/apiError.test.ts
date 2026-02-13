// Unit tests for apiError
import { describe, it, expect } from "vitest";
import { jsonError, getRequestId } from "@/lib/apiError";

describe("jsonError", () => {
  it("returns correct JSON shape with status and message", async () => {
    const res = jsonError(400, "Bad request");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "Bad request",
    });
  });

  it("includes code when provided", async () => {
    const res = jsonError(400, "Invalid input", { code: "invalid_input" });
    const body = await res.json();
    expect(body.code).toBe("invalid_input");
  });

  it("includes requestId when provided", async () => {
    const res = jsonError(500, "Server error", {
      requestId: "req_123",
    });
    const body = await res.json();
    expect(body.requestId).toBe("req_123");
  });
});

describe("getRequestId", () => {
  it("returns x-request-id header when present", () => {
    const req = {
      headers: { get: (n: string) => (n === "x-request-id" ? "custom-id" : null) },
    };
    expect(getRequestId(req)).toBe("custom-id");
  });

  it("generates id when header is missing", () => {
    const req = { headers: { get: () => null } };
    const id = getRequestId(req);
    expect(id).toMatch(/^req_\d+_[a-f0-9]+$/);
  });
});
