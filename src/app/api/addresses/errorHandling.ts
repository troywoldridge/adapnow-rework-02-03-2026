import { ApiError } from "@/lib/apiError";

export type AddressApiErrorResult = {
  body: { ok: false; error: string; details?: unknown };
  status: number;
};

export function handleAddressApiError(
  error: unknown,
  fallbackMessage: string,
): AddressApiErrorResult {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        body: { ok: false, error: "Unauthorized" },
        status: 401,
      };
    }
    if (error.status === 422) {
      return {
        body: { ok: false, error: error.message, details: error.details },
        status: 422,
      };
    }
    return {
      body: { ok: false, error: error.message },
      status: error.status,
    };
  }

  return {
    body: { ok: false, error: fallbackMessage },
    status: 500,
  };
}
