import "server-only";

import { getEnv } from "@/lib/env";
import { getSinaliteAccessToken } from "@/lib/getSinaliteAccessToken";

export type PlaceSinaliteOrderResult = {
  orderId: number;
  message: string;
  status: string;
};

export class SinaliteOrderError extends Error {
  status: number;
  body?: string;

  constructor(message: string, status: number, body?: string) {
    super(message);
    this.name = "SinaliteOrderError";
    this.status = status;
    this.body = body;
  }
}

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function getBaseUrl(): string {
  // Prefer your centralized env helper; fallback to a safe default.
  const base = s(getEnv().SINALITE_BASE_URL);
  // Your older code used api.sinaliteuppy.com; liveapi.sinalite.com is also common.
  // Keep your chosen base but ensure no trailing slash.
  return (base || "https://api.sinaliteuppy.com").replace(/\/+$/, "");
}

function withBearer(token: string): string {
  const t = s(token);
  if (!t) return "";
  return t.toLowerCase().startsWith("bearer ") ? t : `Bearer ${t}`;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function safeReadJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Places a Sinalite order via POST /order/new
 *
 * - Uses getSinaliteAccessToken()
 * - Sends Authorization: Bearer <token>
 * - Applies a hard timeout (default 30s)
 */
export async function placeSinaliteOrder(
  orderData: unknown,
  opts?: {
    timeoutMs?: number;
    baseUrl?: string;
  }
): Promise<PlaceSinaliteOrderResult> {
  const token = await getSinaliteAccessToken();
  const auth = withBearer(token);

  if (!auth) {
    throw new Error("Missing Sinalite access token (getSinaliteAccessToken returned empty).");
  }

  const baseUrl = s(opts?.baseUrl) ? s(opts?.baseUrl).replace(/\/+$/, "") : getBaseUrl();
  const url = `${baseUrl}/order/new`;

  const timeoutMs = Math.max(1_000, Math.min(120_000, Number(opts?.timeoutMs ?? 30_000)));
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: auth,
      },
      body: JSON.stringify(orderData ?? {}),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    const msg =
      err instanceof Error && err.name === "AbortError"
        ? `Sinalite order failed: request timed out after ${timeoutMs}ms`
        : "Sinalite order failed: network error";
    throw new SinaliteOrderError(msg, 502);
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const txt = await safeReadText(res);
    const snippet = s(txt).slice(0, 1200);
    throw new SinaliteOrderError(
      `Sinalite order failed: HTTP ${res.status} ${res.statusText} @ ${url}${snippet ? ` — ${snippet}` : ""}`,
      res.status,
      snippet || undefined,
    );
  }

  const json = await safeReadJson(res);
  if (!json || typeof json !== "object") {
    throw new SinaliteOrderError("Sinalite order returned non-JSON response.", 502);
  }

  // Be tolerant of slight shape variations.
  const orderId = Number((json as any).orderId ?? (json as any).order_id ?? (json as any).id);
  const message = String((json as any).message ?? "ok");
  const status = String((json as any).status ?? "success");

  if (!Number.isFinite(orderId)) {
    throw new SinaliteOrderError(
      `Sinalite order response missing orderId. Got: ${JSON.stringify(json).slice(0, 800)}`,
      502,
    );
  }

  return { orderId, message, status };
}
