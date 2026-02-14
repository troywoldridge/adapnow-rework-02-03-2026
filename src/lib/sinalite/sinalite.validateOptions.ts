// src/lib/sinalite.validateOptions.ts
import "server-only";

import type { SinaliteProductOption } from "@/lib/sinalite/sinalite.product";

export type OptionValidationResult =
  | {
      ok: true;
      normalizedOptionIds: number[];
      groupsUsed: Record<string, number>;
      requiredGroups: string[];
    }
  | {
      ok: false;
      error: "unknown_option_ids" | "missing_groups" | "duplicate_group_choices";
      unknownOptionIds?: number[];
      missingGroups?: string[];
      duplicateGroups?: Array<{ group: string; optionIds: number[] }>;
      requiredGroups: string[];
    };

function normGroup(s: unknown): string {
  return String(s ?? "").trim();
}

function toInt(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n);
}

/**
 * Validates:
 * - all optionIds are known for this product
 * - exactly 1 option per required group
 */
export function validateOnePerGroup(args: {
  optionIds: number[];
  productOptions: SinaliteProductOption[];
  // allow excluding certain groups later if SinaLite introduces metadata flags
  excludeGroups?: string[];
}): OptionValidationResult {
  const exclude = new Set((args.excludeGroups ?? []).map((g) => normGroup(g).toLowerCase()).filter(Boolean));

  // Build optionId -> group map + required groups set
  const optionIdToGroup = new Map<number, string>();
  const requiredGroupsSet = new Set<string>();

  for (const opt of args.productOptions) {
    const id = toInt(opt.id);
    const group = normGroup(opt.group);
    if (id < 1 || !group) continue;

    const groupKey = group.toLowerCase();
    if (!exclude.has(groupKey)) requiredGroupsSet.add(group);
    optionIdToGroup.set(id, group);
  }

  const requiredGroups = Array.from(requiredGroupsSet).sort((a, b) => a.localeCompare(b));

  // Unknown option IDs
  const unknown: number[] = [];
  for (const id of args.optionIds) {
    if (!optionIdToGroup.has(id)) unknown.push(id);
  }
  if (unknown.length) {
    return {
      ok: false,
      error: "unknown_option_ids",
      unknownOptionIds: Array.from(new Set(unknown)).sort((a, b) => a - b),
      requiredGroups,
    };
  }

  // Group usage / duplicates
  const groupToIds = new Map<string, number[]>();
  for (const id of args.optionIds) {
    const group = optionIdToGroup.get(id);
    if (!group) continue;

    const groupKey = group.toLowerCase();
    if (exclude.has(groupKey)) continue;

    const arr = groupToIds.get(group) ?? [];
    arr.push(id);
    groupToIds.set(group, arr);
  }

  const duplicateGroups: Array<{ group: string; optionIds: number[] }> = [];
  for (const [group, ids] of groupToIds.entries()) {
    const uniq = Array.from(new Set(ids));
    if (uniq.length > 1) duplicateGroups.push({ group, optionIds: uniq.sort((a, b) => a - b) });
  }
  if (duplicateGroups.length) {
    duplicateGroups.sort((a, b) => a.group.localeCompare(b.group));
    return {
      ok: false,
      error: "duplicate_group_choices",
      duplicateGroups,
      requiredGroups,
    };
  }

  // Missing groups
  const missingGroups: string[] = [];
  for (const group of requiredGroups) {
    if (!groupToIds.has(group)) missingGroups.push(group);
  }
  if (missingGroups.length) {
    return {
      ok: false,
      error: "missing_groups",
      missingGroups,
      requiredGroups,
    };
  }

  // Normalize: one option per group, stable order by requiredGroups
  const groupsUsed: Record<string, number> = {};
  const normalizedOptionIds: number[] = [];

  for (const group of requiredGroups) {
    const ids = groupToIds.get(group) ?? [];
    const picked = ids[0]; // guaranteed exactly 1 now
    groupsUsed[group] = picked;
    normalizedOptionIds.push(picked);
  }

  return { ok: true, normalizedOptionIds, groupsUsed, requiredGroups };
}
