// src/app/api/shipping/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

/**
 * Top-level Shipping API
 *
 * Purpose:
 * - Provide a stable, future-proof "shipping capabilities" contract to the client.
 * - Centralize what fields are required for estimating/choosing shipping.
 * - Avoid coupling UI to provider-specific details (Sinalite, etc).
 *
 * This route is intentionally lightweight and does NOT call upstreams.
 * Estimation lives at: /api/cart/shipping/estimate
 * Selection lives at: /api/cart/shipping/choose
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

const QuerySchema = z
  .object({
    country: z.enum(["US", "CA"]).optional(),
  })
  .strict();

function readJsonEnv<T>(key: string): T | null {
  const raw = process.env[key];
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

type ShippingCapabilities = {
  supportedCountries: Array<"US" | "CA">;
  addressFields: {
    country: { required: true; values: Array<"US" | "CA"> };
    state: { required: true; notes?: string };
    zip: { required: true; notes?: string };
  };
  endpoints: {
    estimate: string;
    choose: string;
    clearShipping: string;
  };
  defaults: {
    country?: "US" | "CA";
    currencyByCountry: Record<"US" | "CA", "USD" | "CAD">;
  };
  provider?: {
    name: string;
    notes?: string;
  };
  uiHints?: {
    stateLabelByCountry: Record<"US" | "CA", string>;
    zipLabelByCountry: Record<"US" | "CA", string>;
    postalCodePatternHintByCountry?: Partial<Record<"US" | "CA", string>>;
  };
};

function buildCapabilities(country?: "US" | "CA"): ShippingCapabilities {
  const supportedCountries: Array<"US" | "CA"> = ["US", "CA"];

  // Optional env-driven defaults to keep this future-proof.
  // Example:
  //   DEFAULT_SHIP_COUNTRY=US
  //   SHIPPING_PROVIDER_NAME=Sinalite
  //   SHIPPING_UI_HINTS_JSON='{"postalCodePatternHintByCountry":{"US":"12345","CA":"A1A 1A1"}}'
  const defaultCountry = (process.env.DEFAULT_SHIP_COUNTRY || "").toUpperCase();
  const defaultsCountry =
    defaultCountry === "US" || defaultCountry === "CA"
      ? (defaultCountry as "US" | "CA")
      : undefined;

  const providerName = (process.env.SHIPPING_PROVIDER_NAME || "").trim();

  const uiHintsFromEnv = readJsonEnv<ShippingCapabilities["uiHints"]>("SHIPPING_UI_HINTS_JSON");

  const stateLabelByCountry: Record<"US" | "CA", string> = {
    US: "State",
    CA: "Province",
  };

  const zipLabelByCountry: Record<"US" | "CA", string> = {
    US: "ZIP code",
    CA: "Postal code",
  };

  const selected = country && supportedCountries.includes(country) ? country : undefined;

  return {
    supportedCountries,
    addressFields: {
      country: { required: true, values: supportedCountries },
      state: {
        required: true,
        notes: selected
          ? selected === "CA"
            ? "Use province/territory code when available (e.g., ON, BC)."
            : "Use state code when available (e.g., NY, CA)."
          : "Use state/province code when available.",
      },
      zip: {
        required: true,
        notes: selected
          ? selected === "CA"
            ? "Examples: A1A 1A1 or A1A1A1"
            : "Example: 12345"
          : "Enter a valid postal/ZIP code.",
      },
    },
    endpoints: {
      estimate: "/api/cart/shipping/estimate",
      choose: "/api/cart/shipping/choose",
      clearShipping: "/api/cart/clear-shipping",
    },
    defaults: {
      country: defaultsCountry,
      currencyByCountry: {
        US: "USD",
        CA: "CAD",
      },
    },
    provider: providerName
      ? {
          name: providerName,
          notes:
            "Provider-specific details (carrier codes, service names) are returned by the estimate endpoint.",
        }
      : undefined,
    uiHints: {
      stateLabelByCountry,
      zipLabelByCountry,
      ...(uiHintsFromEnv || {}),
    },
  };
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    country: url.searchParams.get("country") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false as const,
        requestId,
        error: "Invalid query",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400, headers: { "x-request-id": requestId } }
    );
  }

  const caps = buildCapabilities(parsed.data.country);

  return NextResponse.json(
    {
      ok: true as const,
      requestId,
      shipping: caps,
    },
    { status: 200, headers: { "x-request-id": requestId } }
  );
}

// Optional: explicitly disallow other methods for clarity.
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  return NextResponse.json(
    {
      ok: false as const,
      requestId,
      error: "Method not allowed. Use GET for capabilities; use /api/cart/shipping/estimate to estimate.",
    },
    { status: 405, headers: { "x-request-id": requestId } }
  );
}
