// src/lib/sinalite/index.ts
// Unified Sinalite module - re-exports from existing libs.
// Use getEnv() for SINALITE_* config.

import "server-only";

export { getSinaliteAccessToken } from "@/lib/getSinaliteAccessToken";
export { priceSinaliteProduct } from "@/lib/sinalite.pricing";
export { fetchSinaliteProductOptions } from "@/lib/sinalite.product";
export { placeSinaliteOrder, SinaliteOrderError } from "@/lib/sinalite.placeOrder";
export {
  getSinaliteProductArrays,
  normalizeOptionGroups,
  apiFetchJson,
  env as sinaliteEnv,
} from "@/lib/sinalite.client";
export { API_BASE, getSinaliteBearer } from "@/lib/sinalite.server";
export { validateOnePerGroup } from "@/lib/sinalite.validateOptions";
export type { SinaliteProductOption } from "@/lib/sinalite.product";
export type { PriceResult } from "@/lib/sinalite.pricing";
