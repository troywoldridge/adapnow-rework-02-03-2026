// src/lib/addressValidation.ts
import "server-only";

import { ApiError } from "@/lib/apiError";

/**
 * Address validation + normalization helpers.
 * Designed to be used by API routes + server actions.
 *
 * Principles:
 * - Keep rules strict enough to avoid broken shipping labels
 * - Avoid over-validating (international formats vary widely)
 * - Normalize consistently (trim, collapse whitespace, uppercase ISO2 country)
 *
 * US/CA:
 * - Adds light, practical checks for state/province + postal formats
 * - Normalizes ZIP+4 and Canadian postal spacing
 */

export type AddressKind = "shipping" | "billing";

export type AddressInput = {
  label?: string | null;

  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;

  email?: string | null;
  phone?: string | null;

  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null; // ISO2 preferred (US/CA/...)
};

export type NormalizedAddress = {
  label: string | null;

  firstName: string | null;
  lastName: string | null;
  company: string | null;

  email: string | null;
  phone: string | null;

  street1: string;
  street2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string; // ISO2 uppercase
};

export type AddressValidationError = {
  ok: false;
  field:
    | "street1"
    | "city"
    | "state"
    | "postalCode"
    | "country"
    | "email"
    | "phone"
    | "firstName"
    | "lastName"
    | "company"
    | "label";
  error: string;
};

export type AddressValidationOk = { ok: true; value: NormalizedAddress };

export type AddressValidationResult = AddressValidationOk | AddressValidationError;

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function collapseWhitespace(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

function isEmailish(v: string): boolean {
  // Lightweight check (do NOT try to fully RFC-validate)
  // Good enough to catch obvious garbage.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizeCountryIso2(v: unknown): string | null {
  const c = s(v).toUpperCase();
  if (!c) return null;
  // Allow only ISO2-like (A-Z 2 chars). Your DB has chk_country_iso2 enforcing this.
  if (!/^[A-Z]{2}$/.test(c)) return null;
  return c;
}

function normalizeState(v: unknown, countryIso2: string | null): string {
  const raw = collapseWhitespace(s(v));
  if (!raw) return "";

  // US/CA: uppercase abbreviations
  if (countryIso2 === "US" || countryIso2 === "CA") return raw.toUpperCase();

  // Else: keep as-is (just collapsed)
  return raw;
}

function normalizePostal(v: unknown, countryIso2: string | null): string {
  const raw = collapseWhitespace(s(v));
  if (!raw) return "";

  const upper = raw.toUpperCase();

  // US ZIP: allow 12345, 123456789, 12345-6789
  if (countryIso2 === "US") {
    const digits = upper.replace(/[^\d]/g, "");
    if (digits.length === 5) return digits;
    if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    // If it doesn't match, return upper as-is and let validation fail below.
    return upper;
  }

  // CA postal: normalize to "A1A 1A1" when possible
  if (countryIso2 === "CA") {
    const compact = upper.replace(/\s+/g, "");
    if (compact.length === 6) return `${compact.slice(0, 3)} ${compact.slice(3)}`;
    return upper;
  }

  // International: trim + collapse spaces + uppercase letters
  return upper;
}

function normalizePhoneLoose(v: unknown): string | null {
  const raw = s(v);
  if (!raw) return null;

  // Keep leading + if present, strip other non-digits
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  const out = hasPlus ? `+${digits}` : digits;

  // If it's too short to be useful, treat as absent.
  if (digits.length < 7) return null;

  return out;
}

function isUsStateCode(v: string): boolean {
  return /^[A-Z]{2}$/.test(v);
}

function isCaProvinceCode(v: string): boolean {
  // Keep it simple: 2-letter code (ON, QC, BC, AB, etc.)
  return /^[A-Z]{2}$/.test(v);
}

function isUsZip(v: string): boolean {
  // Accept 12345 or 12345-6789
  return /^\d{5}(-\d{4})?$/.test(v);
}

function isCaPostal(v: string): boolean {
  // Accept A1A 1A1 (space optional)
  // Excludes D,F,I,O,Q,U in standard formats, but we keep it light and practical.
  const compact = v.replace(/\s+/g, "");
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact);
}

/**
 * Validate + normalize an address input.
 *
 * Required fields:
 * - street1, city, state, postalCode, country
 *
 * Notes:
 * - We keep name/email/phone optional because:
 *   - billing contacts vary
 *   - shipping labels can rely on customer profile
 * - If email is provided, it must look like an email.
 * - If phone is provided, it is normalized loosely; if too short it's discarded.
 *
 * US/CA rules:
 * - US: state must be 2 letters; postal must be ZIP5 or ZIP+4
 * - CA: province must be 2 letters; postal must be A1A 1A1 (space optional)
 */
export function validateAddress(
  input: AddressInput,
  opts?: { kind?: AddressKind },
): AddressValidationResult {
  const kind = opts?.kind ?? "shipping";

  const label = s(input.label);
  const firstName = s(input.firstName);
  const lastName = s(input.lastName);
  const company = s(input.company);

  const emailRaw = s(input.email);
  const phoneNorm = normalizePhoneLoose(input.phone);

  const street1 = collapseWhitespace(s(input.street1));
  const street2 = collapseWhitespace(s(input.street2));
  const city = collapseWhitespace(s(input.city));
  const country = normalizeCountryIso2(input.country);

  const state = normalizeState(input.state, country);
  const postalCode = normalizePostal(input.postalCode, country);

  if (!street1) return { ok: false, field: "street1", error: "Street address is required." };
  if (!city) return { ok: false, field: "city", error: "City is required." };
  if (!state) return { ok: false, field: "state", error: "State/Province/Region is required." };
  if (!postalCode) return { ok: false, field: "postalCode", error: "Postal code is required." };
  if (!country) {
    return {
      ok: false,
      field: "country",
      error: "Country must be a 2-letter ISO code (e.g., US, CA).",
    };
  }

  if (emailRaw && !isEmailish(emailRaw)) {
    return { ok: false, field: "email", error: "Email address looks invalid." };
  }

  // US/CA: lightweight practical checks
  if (country === "US") {
    if (!isUsStateCode(state)) {
      return { ok: false, field: "state", error: "US state must be a 2-letter code (e.g., NY)." };
    }
    if (!isUsZip(postalCode)) {
      return { ok: false, field: "postalCode", error: "US ZIP must be 5 digits or ZIP+4 (e.g., 12345 or 12345-6789)." };
    }
  }

  if (country === "CA") {
    if (!isCaProvinceCode(state)) {
      return { ok: false, field: "state", error: "Canadian province must be a 2-letter code (e.g., ON)." };
    }
    if (!isCaPostal(postalCode)) {
      return { ok: false, field: "postalCode", error: "Canadian postal code must look like A1A 1A1." };
    }
  }

  // Optional stricter rules depending on kind (future-proof switch)
  if (kind === "shipping") {
    // Shipping often needs a recipient name OR company; we won't hard-require.
    // (If you want to require one, we can flip it later.)
    void firstName;
    void lastName;
    void company;
  }

  const normalized: NormalizedAddress = {
    label: label ? label : null,

    firstName: firstName ? firstName : null,
    lastName: lastName ? lastName : null,
    company: company ? company : null,

    email: emailRaw ? emailRaw : null,
    phone: phoneNorm,

    street1,
    street2: street2 ? street2 : null,
    city,
    state,
    postalCode,
    country,
  };

  return { ok: true, value: normalized };
}

/**
 * Convenience: throws on invalid input (useful for server actions).
 * Stage 2: throw ApiError (422) so routes can use fail() uniformly.
 */
export function requireValidAddress(input: AddressInput, opts?: { kind?: AddressKind }): NormalizedAddress {
  const res = validateAddress(input, opts);
  if (!res.ok) {
    // Keep the "field: message" shape for backwards compatibility with older handlers,
    // but make it a proper API error for Stage 2 plumbing.
    throw new ApiError({
      status: 422,
      code: "BAD_REQUEST",
      message: `${res.field}: ${res.error}`,
      details: { field: res.field, error: res.error },
    });
  }
  return res.value;
}
