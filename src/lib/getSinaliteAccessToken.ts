// src/lib/getSinaliteAccessToken.ts
import "server-only";

import { requireSinaliteAuth } from "@/lib/env";

type TokenResponse = {
  access_token: string;
  token_type: string; // usually "Bearer"
  expires_in?: number; // seconds
};

let cachedBearer = "";
let expiresAt = 0; // epoch ms

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function clampTtlSeconds(ttl: number): number {
  // Keep it sane: min 60s, max 24h
  if (!Number.isFinite(ttl)) return 1200;
  return Math.min(86_400, Math.max(60, Math.trunc(ttl)));
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);

  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export async function getSinaliteAccessToken(): Promise<string> {
  const now = Date.now();

  // Reuse token if still valid (with a 60s safety margin)
  if (cachedBearer && now < expiresAt - 60_000) {
    return cachedBearer;
  }

  const { url, clientId: client_id, clientSecret: client_secret, audience } =
    requireSinaliteAuth();
  const grant_type = "client_credentials";

  const res = await fetchJsonWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ client_id, client_secret, audience, grant_type }),
    },
    12_000,
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `Sinalite auth failed: ${res.status} ${res.statusText}${txt ? ` - ${txt}` : ""}`.trim(),
    );
  }

  const data = (await res.json()) as TokenResponse;

  const token = s(data?.access_token);
  const type = s(data?.token_type);

  if (!token || !type) {
    throw new Error("Invalid Sinalite token response (missing access_token/token_type)");
  }

  cachedBearer = `${type} ${token}`;

  // Prefer expires_in when provided; default to ~20 minutes
  const ttlSec = clampTtlSeconds(typeof data.expires_in === "number" ? data.expires_in : 1200);
  expiresAt = now + ttlSec * 1000;

  return cachedBearer;
}
