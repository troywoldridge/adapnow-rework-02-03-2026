// src/lib/shippingChoice.ts

export type ShippingChoice = {
  country: "US" | "CA";
  state: string;
  zip: string;
  carrier: string;
  method: string;
  cost: number; // dollars
  days: number | null;
  currency: "USD" | "CAD";
};

type StoredChoice = ShippingChoice & {
  // added in rebuild; optional for back-compat with old entries
  savedAt?: number;
};

const PREFIX = "ADAP_SHIP_";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normState(state: unknown): string {
  return String(state ?? "").trim().toUpperCase();
}

function normZip(zip: unknown): string {
  return String(zip ?? "").trim();
}

function keyFor(choice: Pick<ShippingChoice, "country" | "state" | "zip">): string {
  const state = normState(choice.state);
  const zip = normZip(choice.zip);
  return `${PREFIX}${choice.country}_${state}_${zip}`;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isShippingChoice(v: any): v is ShippingChoice {
  if (!v || typeof v !== "object") return false;

  const countryOk = v.country === "US" || v.country === "CA";
  const currencyOk = v.currency === "USD" || v.currency === "CAD";

  const stateOk = typeof v.state === "string" && v.state.trim().length > 0;
  const zipOk = typeof v.zip === "string" && v.zip.trim().length > 0;

  const carrierOk = typeof v.carrier === "string" && v.carrier.trim().length > 0;
  const methodOk = typeof v.method === "string" && v.method.trim().length > 0;

  const costOk = typeof v.cost === "number" && Number.isFinite(v.cost) && v.cost >= 0;

  const daysOk =
    v.days === null || (typeof v.days === "number" && Number.isFinite(v.days) && v.days >= 0);

  return countryOk && currencyOk && stateOk && zipOk && carrierOk && methodOk && costOk && daysOk;
}

function toStoredChoice(v: unknown): StoredChoice | null {
  if (!isShippingChoice(v)) return null;
  const any = v as any;
  const savedAt =
    typeof any.savedAt === "number" && Number.isFinite(any.savedAt) ? any.savedAt : undefined;
  return { ...(v as ShippingChoice), ...(savedAt ? { savedAt } : {}) };
}

/**
 * Save a shipping choice for (country/state/zip).
 * Adds a savedAt timestamp so we can pick "most recent" deterministically.
 */
export function saveShipChoice(choice: ShippingChoice) {
  if (!isBrowser()) return;

  try {
    const key = keyFor(choice);
    const stored: StoredChoice = { ...choice, savedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

/**
 * Read shipping choice for a specific (country/state/zip).
 */
export function readShipChoice(
  country: "US" | "CA",
  state: string,
  zip: string,
): ShippingChoice | null {
  if (!isBrowser()) return null;

  try {
    const raw = localStorage.getItem(keyFor({ country, state, zip }));
    if (!raw) return null;

    const parsed = safeJsonParse(raw);
    const stored = toStoredChoice(parsed);
    return stored ? (stored as ShippingChoice) : null;
  } catch {
    return null;
  }
}

/**
 * Read the most recently-written shipping choice, if present.
 * Strategy:
 * - Iterate ADAP_SHIP_* keys
 * - Choose the one with the highest savedAt (fallback to first valid if legacy/no timestamps)
 */
export function readAnyShipChoice(): ShippingChoice | null {
  if (!isBrowser()) return null;

  try {
    let best: StoredChoice | null = null;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (!k.startsWith(PREFIX)) continue;

      const raw = localStorage.getItem(k);
      if (!raw) continue;

      const parsed = safeJsonParse(raw);
      const stored = toStoredChoice(parsed);
      if (!stored) continue;

      if (!best) {
        best = stored;
        continue;
      }

      // Prefer newer timestamps; if missing, keep the first found best
      const a = typeof stored.savedAt === "number" ? stored.savedAt : -1;
      const b = typeof best.savedAt === "number" ? best.savedAt : -1;

      if (a > b) best = stored;
    }

    return best ? (best as ShippingChoice) : null;
  } catch {
    return null;
  }
}

/**
 * Clear choice for a specific (country/state/zip).
 */
export function clearShipChoice(country: "US" | "CA", state: string, zip: string) {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(keyFor({ country, state, zip }));
  } catch {
    // ignore
  }
}

/**
 * Clear all saved shipping choices (useful during rebuild/debug).
 */
export function clearAllShipChoices() {
  if (!isBrowser()) return;
  try {
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (k.startsWith(PREFIX)) toDelete.push(k);
    }
    for (const k of toDelete) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

/**
 * Best-effort: push localStorage shipping choice to the server cart.
 * Safe to call in client effects.
 */
export async function flushShipChoiceToCart(signal?: AbortSignal) {
  if (!isBrowser()) return;

  const picked = readAnyShipChoice();
  if (!picked) return;

  // Send only what the server route expects (avoid sending extra internal fields)
  const payload: ShippingChoice = {
    country: picked.country,
    state: normState(picked.state),
    zip: normZip(picked.zip),
    carrier: String(picked.carrier ?? "").trim(),
    method: String(picked.method ?? "").trim(),
    cost: Number(picked.cost ?? 0),
    days: picked.days ?? null,
    currency: picked.currency,
  };

  try {
    await fetch("/api/cart/shipping/choose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch {
    // ignore network / abort errors
  }
}
