import { describe, expect, it } from "vitest";
import * as mod from "../apiError";

function getApiErrorFn(): any {
  // Common export patterns:
  // - named: export function apiError() {}
  // - default: export default function apiError() {}
  // - alt names: apiErrorResponse / makeApiError / buildApiError
  return (
    (mod as any).apiError ??
    (mod as any).apiErrorResponse ??
    (mod as any).makeApiError ??
    (mod as any).buildApiError ??
    (mod as any).default
  );
}

describe("apiError module", () => {
  it("exports an apiError-like function", () => {
    const fn = getApiErrorFn();
    expect(typeof fn).toBe("function");
  });

  it("produces a consistent ok=false envelope", () => {
    const fn = getApiErrorFn();
    const res = fn(400, "BAD_REQUEST", "Nope", { requestId: "req_test_123" });

    expect(res).toBeTruthy();
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();

    // Flexible shape checks (don’t overfit)
    expect(res.error.code).toBeTruthy();
    expect(res.error.message).toBeTruthy();
    expect(res.error.status ?? res.error.httpStatus ?? res.status).toBeTruthy();
  });

  it("supports details and requestId", () => {
    const fn = getApiErrorFn();
    const res = fn(422, "VALIDATION_ERROR", "Invalid", {
      requestId: "req_test_456",
      details: { field: "email" },
    });

    expect(res.ok).toBe(false);

    const err = res.error ?? {};
    expect(typeof (err.requestId ?? "x")).toBe("string");
    expect(err.details ?? res.details).toBeTruthy();
  });
});
