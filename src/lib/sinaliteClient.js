// src/lib/sinaliteClient.js
// Server-side Sinalite client: token caching + fetch helpers.

import "server-only";

function pickEnv(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function requiredEnv(key) {
  const v = pickEnv(key);
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const tokenCache = {
  bearer: null,
  expiresAtMs: 0,
};

async function fetchAccessToken() {
  const baseUrl = (pickEnv("SINALITE_BASE_URL") || "https://liveapi.sinalite.com").replace(/\/+$/, "");
  const authUrl = (pickEnv("SINALITE_AUTH_URL") || `${baseUrl}/auth/token`).replace(/\/+$/, "");

  const clientId = requiredEnv("SINALITE_CLIENT_ID");
  const clientSecret = requiredEnv("SINALITE_CLIENT_SECRET");
  const audience = pickEnv("SINALITE_AUDIENCE") || "https://apiconnect.sinalite.com";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(authUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        audience,
        grant_type: "client_credentials",
      }),
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Sinalite auth failed ${res.status} ${res.statusText}: ${text.slice(0, 250)}`);
    }

    let data;
    try {
      data = JSON.parse(text || "{}");
    } catch {
      throw new Error(`Sinalite auth non-JSON: ${text.slice(0, 250)}`);
    }

    const token = typeof data.access_token === "string" ? data.access_token.trim() : "";
    const type = typeof data.token_type === "string" ? data.token_type.trim() : "Bearer";
    if (!token) throw new Error("Sinalite auth missing access_token");

    const expiresInSec =
      typeof data.expires_in === "number" && Number.isFinite(data.expires_in) ? data.expires_in : 3600;
    const ttlMs = Math.max(60_000, Math.min(24 * 3600 * 1000, expiresInSec * 1000));

    tokenCache.bearer = `${type} ${token}`.trim().replace(/\s+/g, " ");
    tokenCache.expiresAtMs = Date.now() + ttlMs;

    return tokenCache.bearer;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAccessTokenCached() {
  const now = Date.now();
  if (tokenCache.bearer && now < tokenCache.expiresAtMs - 60_000) return tokenCache.bearer;
  return fetchAccessToken();
}

export function resolveSinaliteBaseUrl() {
  return (pickEnv("SINALITE_BASE_URL") || "https://liveapi.sinalite.com").replace(/\/+$/, "");
}

export function normalizeStoreCode(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return "en_us";
  if (v === "us" || v === "en_us" || v === "usd") return "en_us";
  if (v === "ca" || v === "en_ca" || v === "cad") return "en_ca";
  return v; // allow passing en_us/en_ca already
}

export function storeIdForPrice(storeCode) {
  // Docs say POST /price/{id}/{storeCode} uses storeId (6=CA, 9=US)
  const sc = normalizeStoreCode(storeCode);
  if (sc === "en_ca") return 6;
  return 9;
}

async function fetchWithRetry(url, options, { maxRetries = 5, baseDelayMs = 800, timeoutMs = 30_000 } = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        const retryAfter = res.headers.get("Retry-After");
        const retryAfterSec = retryAfter ? parseInt(retryAfter, 10) : NaN;

        const delay =
          Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? retryAfterSec * 1000
            : baseDelayMs * Math.pow(2, attempt - 1);

        if (attempt < maxRetries) {
          await sleep(delay);
          continue;
        }
      }

      return res;
    } catch (err) {
      clearTimeout(timeout);
      if (attempt >= maxRetries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  // should never happen
  throw new Error(`Exhausted retries for ${url}`);
}

export async function sinalitePostPrice({ productId, storeCode, optionIds }) {
  const base = resolveSinaliteBaseUrl();
  const storeId = storeIdForPrice(storeCode);
  const url = `${base}/price/${Number(productId)}/${storeId}`;

  const bearer = await getAccessTokenCached();

  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: {
        Authorization: bearer,
        "content-type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ productOptions: optionIds }),
    },
    { maxRetries: 5, baseDelayMs: 800, timeoutMs: 30_000 }
  );

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Sinalite POST /price failed ${res.status} ${res.statusText}: ${text.slice(0, 250)}`);
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Sinalite POST /price non-JSON: ${text.slice(0, 250)}`);
  }
}
