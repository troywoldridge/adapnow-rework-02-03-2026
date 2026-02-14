// src/lib/sinalite/index.ts
// Unified Sinalite module - re-exports from existing libs.
// Use getEnv() for SINALITE_* config.

import "server-only";

export { getSinaliteAccessToken } from "@/lib/getSinaliteAccessToken";
export { priceSinaliteProduct } from "@/lib/sinalite/sinalite.pricing";
export { fetchSinaliteProductOptions } from "@/lib/sinalite/sinalite.product";
export { placeSinaliteOrder, SinaliteOrderError } from "@/lib/sinalite/sinalite.placeOrder";
export {
  getSinaliteProductArrays,
  normalizeOptionGroups,
  apiFetchJson,
  env as sinaliteEnv,
} from "@/lib/sinalite/sinalite.client";
export { API_BASE, getSinaliteBearer } from "@/lib/sinalite/sinalite.server";
export { validateOnePerGroup } from "@/lib/sinalite/sinalite.validateOptions";
export type { SinaliteProductOption } from "@/lib/sinalite/sinalite.product";
export type { PriceResult } from "@/lib/sinalite/sinalite.pricing";
