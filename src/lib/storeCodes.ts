// src/lib/storeCodes.ts

export type Store = "US" | "CA";
export type Currency = "USD" | "CAD";
export type StoreCode = "en_us" | "en_ca";

function cleanUpper(s: string): string {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");
}

/**
 * Normalize to "USD" | "CAD" from a variety of inputs:
 * - Store: "US" | "CA"
 * - Locale: "en_us" | "en_ca"
 * - Currency: "USD" | "CAD"
 * - Legacy numeric store codes: 9 (US) | 6 (CA)
 */
export function storeToCurrency(s: Store | string): Currency {
  const v = cleanUpper(String(s));

  if (v === "CAD") return "CAD";
  if (v === "USD") return "USD";

  if (v === "CA" || v === "CANADA" || v === "EN_CA" || v.endsWith("_CA") || v === "6") return "CAD";
  if (v === "US" || v === "USA" || v === "EN_US" || v.endsWith("_US") || v === "9") return "USD";

  // Default to USD for unknown inputs
  return "USD";
}

/** Convert currency to locale store code used by storefront endpoints. */
export function currencyToStoreCode(c: Currency): StoreCode {
  return c === "CAD" ? "en_ca" : "en_us";
}

/** Convert a store-ish input directly to locale store code. */
export function storeToStoreCode(s: Store | string): StoreCode {
  return currencyToStoreCode(storeToCurrency(s));
}

/** Convert a currency-ish input to store ("US" | "CA"). */
export function currencyToStore(c: Currency | string): Store {
  return storeToCurrency(c) === "CAD" ? "CA" : "US";
}
