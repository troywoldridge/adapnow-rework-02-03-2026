// src/lib/env.ts
// Centralized environment variable access with validation.
// Validates on first access; throws with clear message if required vars are missing.

import "server-only";

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function pickEnv(...keys: string[]): string | null {
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

type EnvShape = {
  DATABASE_URL: string;
  SINALITE_BASE_URL: string;
  SINALITE_AUTH_URL: string;
  SINALITE_AUDIENCE: string;
  SINALITE_CLIENT_ID: string | null;
  SINALITE_CLIENT_SECRET: string | null;
  STRIPE_SECRET_KEY: string | null;
  STRIPE_API_KEY: string | null;
  STRIPE_API_VERSION: string | null;
  R2_ACCOUNT_ID: string | null;
  R2_ACCESS_KEY_ID: string | null;
  R2_SECRET_ACCESS_KEY: string | null;
  R2_BUCKET: string | null;
  NEXT_PUBLIC_STORE_CODE: string;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string | null;
};

let _cached: EnvShape | null = null;

function validateEnv(): EnvShape {
  if (_cached) return _cached;

  const dbUrl = pickEnv("DATABASE_URL", "POSTGRES_URL", "NEON_URL");
  const sinaliteBase =
    pickEnv("SINALITE_API_BASE", "SINALITE_BASE_URL") || "https://liveapi.sinalite.com";
  const sinaliteAuth =
    pickEnv("SINALITE_AUTH_URL") ||
    "https://api.sinaliteuppy.com/auth/token";
  const sinaliteAudience =
    pickEnv("SINALITE_AUDIENCE", "SINALITE_API_AUDIENCE") ||
    "https://apiconnect.sinalite.com";

  _cached = {
    DATABASE_URL: dbUrl ?? "",
    SINALITE_BASE_URL: sinaliteBase.replace(/\/+$/, ""),
    SINALITE_AUTH_URL: sinaliteAuth,
    SINALITE_AUDIENCE: sinaliteAudience,
    SINALITE_CLIENT_ID: pickEnv("SINALITE_CLIENT_ID"),
    SINALITE_CLIENT_SECRET: pickEnv("SINALITE_CLIENT_SECRET"),
    STRIPE_SECRET_KEY: pickEnv("STRIPE_SECRET_KEY"),
    STRIPE_API_KEY: pickEnv("STRIPE_API_KEY"),
    STRIPE_API_VERSION: pickEnv("STRIPE_API_VERSION"),
    R2_ACCOUNT_ID: pickEnv("R2_ACCOUNT_ID"),
    R2_ACCESS_KEY_ID: pickEnv("R2_ACCESS_KEY_ID"),
    R2_SECRET_ACCESS_KEY: pickEnv("R2_SECRET_ACCESS_KEY"),
    R2_BUCKET: pickEnv("R2_BUCKET", "R2_BUCKET_NAME"),
    NEXT_PUBLIC_STORE_CODE: s(process.env.NEXT_PUBLIC_STORE_CODE) || "en_us",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: pickEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
  };

  return _cached;
}

export function getEnv(): EnvShape {
  return validateEnv();
}

/** Requires DATABASE_URL; throws if missing. */
export function requireDatabaseUrl(): string {
  const e = getEnv();
  if (!e.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Provide DATABASE_URL (or POSTGRES_URL / NEON_URL) in the environment."
    );
  }
  return e.DATABASE_URL;
}

/** Requires Sinalite auth vars; throws if missing. */
export function requireSinaliteAuth(): {
  url: string;
  clientId: string;
  clientSecret: string;
  audience: string;
} {
  const e = getEnv();
  const clientId = e.SINALITE_CLIENT_ID;
  const clientSecret = e.SINALITE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing SINALITE_CLIENT_ID and/or SINALITE_CLIENT_SECRET. Set them in the environment."
    );
  }
  return {
    url: e.SINALITE_AUTH_URL,
    clientId,
    clientSecret,
    audience: e.SINALITE_AUDIENCE,
  };
}

/** Requires Stripe key; throws if missing. */
export function requireStripeKey(): string {
  const e = getEnv();
  const key = e.STRIPE_SECRET_KEY ?? e.STRIPE_API_KEY;
  if (!key) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY (or STRIPE_API_KEY). Set it in your env before starting the server."
    );
  }
  return key;
}
