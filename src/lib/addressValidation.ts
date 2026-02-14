// src/lib/addressValidation.ts
import "server-only";

/**
 * Address validation + normalization helpers.
 * Designed to be used by API routes + server actions.
 *
 * Principles:
 * - Keep rules strict enough to avoid broken shipping labels
 * - Avoid over-validating (international formats vary widely)
 * - Normalize consistently (trim, collapse whitespace, uppercase ISO2 country)
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

function normalizePostal(v: unknown): string {
  // Keep it simple: trim + collapse spaces + uppercase letters.
  // (We avoid country-specific formatting here; carriers accept many formats.)
  const p = collapseWhitespace(s(v)).toUpperCase();
  return p;
}

function normalizeState(v: unknown): string {
  // Don't assume ISO subdivision codes; just collapse whitespace.
  // US/CA typically uppercase abbreviations, but other countries vary.
  return collapseWhitespace(s(v));
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
 */
export function validateAddress(
  input: AddressInput,
  opts?: { kind?: AddressKind }
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
  const state = normalizeState(input.state);
  const postalCode = normalizePostal(input.postalCode);
  const country = normalizeCountryIso2(input.country);

  if (!street1) return { ok: false, field: "street1", error: "Street address is required." };
  if (!city) return { ok: false, field: "city", error: "City is required." };
  if (!state) return { ok: false, field: "state", error: "State/Province/Region is required." };
  if (!postalCode) {
    return { ok: false, field: "postalCode", error: "Postal code is required." };
  }
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

  // Optional stricter rules depending on kind (future-proof switch)
  if (kind === "shipping") {
    // Shipping often needs a recipient name OR company; we won't hard-require,
    // but we can at least normalize empties.
    // (If you want to require one, we can flip it later.)
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
 */
export function requireValidAddress(input: AddressInput, opts?: { kind?: AddressKind }): NormalizedAddress {
  const res = validateAddress(input, opts);
  if (!res.ok) {
    throw new Error(`${res.field}: ${res.error}`);
  }
  return res.value;
}
