#!/usr/bin/env node
/**
 * scripts/sinaliteAuth.js
 *
 * Fetches a Sinalite OAuth2 access token (client_credentials grant).
 * Used by ingest scripts and for manual verification.
 *
 * Required env vars:
 *   SINALITE_CLIENT_ID
 *   SINALITE_CLIENT_SECRET
 *
 * Optional:
 *   SINALITE_AUTH_URL   (default: https://api.sinaliteuppy.com/auth/token)
 *   SINALITE_AUDIENCE   (default: https://apiconnect.sinalite.com)
 *
 * Usage:
 *   node scripts/sinaliteAuth.js
 *   node scripts/sinaliteAuth.js --json   # output JSON only
 */

const DEFAULT_AUTH_URL = "https://api.sinaliteuppy.com/auth/token";
const DEFAULT_AUDIENCE = "https://apiconnect.sinalite.com";
const TIMEOUT_MS = 15_000;

function pickEnv(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

async function fetchWithTimeout(url, init, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function getToken() {
  const url = pickEnv("SINALITE_AUTH_URL") || DEFAULT_AUTH_URL;
  const client_id = pickEnv("SINALITE_CLIENT_ID");
  const client_secret = pickEnv("SINALITE_CLIENT_SECRET");
  const audience = pickEnv("SINALITE_AUDIENCE") || DEFAULT_AUDIENCE;
  const grant_type = "client_credentials";

  if (!client_id || !client_secret) {
    throw new Error(
      "Missing SINALITE_CLIENT_ID and/or SINALITE_CLIENT_SECRET. Set them in env and re-run."
    );
  }

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id, client_secret, audience, grant_type }),
    },
    TIMEOUT_MS
  );

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Sinalite auth failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Sinalite auth returned non-JSON: ${text.slice(0, 200)}`);
  }

  const token = data?.access_token;
  const type = (data?.token_type || "Bearer").trim();

  if (!token || typeof token !== "string") {
    throw new Error("Invalid Sinalite token response (missing access_token)");
  }

  const bearer = type.toLowerCase().startsWith("bearer") ? `${type} ${token}` : `Bearer ${token}`;

  return {
    bearer,
    access_token: token,
    token_type: type,
    expires_in: data?.expires_in ?? 3600,
  };
}

async function main() {
  const jsonOnly = process.argv.includes("--json");

  try {
    const result = await getToken();

    if (jsonOnly) {
      console.log(JSON.stringify(result));
      return;
    }

    console.log("✅ Sinalite auth successful");
    console.log(`   Token type: ${result.token_type}`);
    console.log(`   Expires in: ${result.expires_in}s`);
    console.log(`   Bearer (first 50 chars): ${result.bearer.slice(0, 50)}...`);
  } catch (err) {
    console.error("❌ Sinalite auth failed:", err.message);
    process.exit(1);
  }
}

main();
