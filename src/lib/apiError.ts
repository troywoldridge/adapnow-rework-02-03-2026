export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type ApiErrorShape = {
  ok: false;
  error: {
    status: number;
    code: ApiErrorCode | string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
};

export function apiError(
  status: number,
  code: ApiErrorCode | string,
  message: string,
  opts?: { requestId?: string; details?: unknown }
): ApiErrorShape {
  return {
    ok: false,
    error: {
      status,
      code,
      message,
      requestId: opts?.requestId,
      details: opts?.details ?? null,
    },
  };
}

// Common alias exports (helps older call-sites if you had them)
export const apiErrorResponse = apiError;
export default apiError;
