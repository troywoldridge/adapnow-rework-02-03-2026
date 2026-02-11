import type { ShippingChoice } from "@/lib/shippingChoice";
import type { SinaliteShippingMethod } from "@/types/shipping";

export function sinaliteMethodToChoice(
  method: SinaliteShippingMethod,
  location: {
    country: "US" | "CA";
    state: string;
    zip: string;
    currency?: "USD" | "CAD";
  }
): ShippingChoice {
  return {
    country: location.country,
    state: String(location.state ?? "").trim().toUpperCase(),
    zip: String(location.zip ?? "").trim(),

    carrier: method.carrier,
    method: method.service,

    cost: Number(method.price ?? 0),
    days: null,

    currency: location.currency ?? (location.country === "CA" ? "CAD" : "USD"),
  };
}
