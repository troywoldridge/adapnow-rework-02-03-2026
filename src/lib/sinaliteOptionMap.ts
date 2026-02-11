// src/lib/sinaliteOptionMap.ts
import "server-only";

import { lruGet, lruSet } from "@/lib/lru";
import { getSinaliteProductArrays, normalizeOptionGroups } from "@/lib/sinalite.client";

/**
 * Tiny memo so we don't re-fetch product option metadata constantly.
 * Cache key: productId string
 * Value: map of valueId -> groupKey
 */
const CACHE_PREFIX = "sinalite:v2g:";

export type SinaOptions = { options: Record<string, string> };

/**
 * Build a map: valueId -> option-group key
 * (Keys must match SinaLite’s expected group names; values must be ID STRINGS)
 */
export async function valueIdToGroupKey(productId: number): Promise<Record<number, string>> {
  const pid = Number(productId);
  if (!Number.isFinite(pid) || pid <= 0) return {};

  const cacheKey = `${CACHE_PREFIX}${pid}`;
  const cached = lruGet<Record<number, string>>(cacheKey);
  if (cached) return cached;

  const { optionsArray } = await getSinaliteProductArrays(String(pid));
  const groups = normalizeOptionGroups(optionsArray || []);

  const map: Record<number, string> = {};

  // normalizeOptionGroups returns: { group, label, values: [{id,name}] }
  for (const g of groups as any[]) {
    const groupKey = String(g?.group ?? g?.name ?? g?.label ?? "").trim();
    if (!groupKey) continue;

    const values: any[] =
      Array.isArray(g?.values) ? g.values :
      Array.isArray(g?.options) ? g.options :
      Array.isArray(g?.items) ? g.items :
      Array.isArray(g?.choices) ? g.choices : [];

    for (const o of values) {
      const id = Number(o?.id ?? o?.valueId ?? o?.optionId ?? o?.value ?? o?.code);
      if (Number.isFinite(id) && id > 0) {
        map[id] = groupKey;
      }
    }
  }

  lruSet(cacheKey, map);
  return map;
}

/**
 * Convert a flat list of selected valueIds into SinaLite’s:
 *   { options: { [group]: "valueId" } }
 * If multiple ids map to the same group, last one wins.
 */
export async function optionIdsToSinaOptions(
  productId: number,
  optionIds: number[]
): Promise<SinaOptions | null> {
  const pid = Number(productId);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  if (!Array.isArray(optionIds) || optionIds.length === 0) return null;

  const v2g = await valueIdToGroupKey(pid);
  const options: Record<string, string> = {};

  for (const idRaw of optionIds) {
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) continue;

    const groupKey = v2g[id];
    if (!groupKey) continue;

    // Values must be ID strings per docs
    options[groupKey] = String(id);
  }

  if (Object.keys(options).length === 0) return null;
  return { options };
}
