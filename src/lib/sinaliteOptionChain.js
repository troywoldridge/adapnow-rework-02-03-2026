// src/lib/sinaliteOptionChain.js
import "server-only";

import { Pool } from "pg";

let _pool;
function dbPool() {
  if (_pool) return _pool;
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL is not set");
  _pool = new Pool({ connectionString: cs, max: 10 });
  return _pool;
}

export function normalizeStoreCode(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return "en_us";
  if (v === "us" || v === "en_us") return "en_us";
  if (v === "ca" || v === "en_ca") return "en_ca";
  return v;
}

// A sane default group ordering.
// Anything not listed falls back to alphabetical and keeps relative stability.
const GROUP_PRIORITY = [
  "Stock",
  "size",
  "Size",
  "qty",
  "Qty",
  "quantity",
  "Quantity",
  "Coating",
  "Lamination",
  "Finishing",
  "Colorspec",
  "Color Spec",
  "Round Corners",
  "Corners",
  "Bundling",
  "Scoring",
  "Folding",
  "Turnaround",
  "Turn Around",
  "Turnaround Time",
];

function groupRank(group) {
  const idx = GROUP_PRIORITY.findIndex((g) => g.toLowerCase() === String(group).toLowerCase());
  return idx === -1 ? 10_000 : idx;
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : NaN;
}

function sortUniqueNums(nums) {
  const arr = nums.slice().sort((a, b) => a - b);
  const out = [];
  for (const n of arr) {
    if (!out.length || out[out.length - 1] !== n) out.push(n);
  }
  return out;
}

export function variantKeyFromOptionIds(optionIds) {
  const sorted = sortUniqueNums(optionIds);
  return sorted.join("-");
}

export async function buildOptionChainFromSelections({ productId, storeCode, selections }) {
  const pid = toInt(productId);
  const sc = normalizeStoreCode(storeCode);

  if (!Number.isFinite(pid) || pid <= 0) throw new Error("productId must be a positive integer");
  if (!selections || typeof selections !== "object") throw new Error("selections must be an object of {group: optionId}");

  // selections: { groupName: optionId }
  const chosenGroups = Object.keys(selections).map((g) => String(g).trim()).filter(Boolean);
  if (!chosenGroups.length) throw new Error("selections is empty");

  const chosenOptionIds = {};
  for (const g of chosenGroups) {
    const id = toInt(selections[g]);
    if (!Number.isFinite(id) || id <= 0) throw new Error(`Invalid option id for group "${g}"`);
    chosenOptionIds[g] = id;
  }

  // Validate these option_ids actually exist for this product/store and learn canonical group labels.
  const pool = dbPool();
  const client = await pool.connect();
  try {
    const ids = Object.values(chosenOptionIds);
    const res = await client.query(
      `
      SELECT option_id, option_group
      FROM sinalite_product_options
      WHERE product_id = $1
        AND store_code = $2
        AND option_id = ANY($3::int[]);
    `,
      [pid, sc, ids]
    );

    if (res.rowCount !== ids.length) {
      // figure out which are missing for better error output
      const found = new Set(res.rows.map((r) => Number(r.option_id)));
      const missing = ids.filter((id) => !found.has(Number(id)));
      throw new Error(`Some optionIds are not valid for product/store: missing=[${missing.join(",")}]`);
    }

    // Map option_id -> canonical option_group from DB
    const idToGroup = new Map();
    for (const row of res.rows) {
      idToGroup.set(Number(row.option_id), String(row.option_group ?? "").trim());
    }

    // Canonical groups list = groups implied by those option IDs
    // (This protects you if user passes group label casing slightly differently)
    const groupToId = new Map();
    for (const [g, id] of Object.entries(chosenOptionIds)) {
      const canonicalGroup = idToGroup.get(Number(id)) || g;
      if (groupToId.has(canonicalGroup)) {
        throw new Error(`Duplicate group selection for "${canonicalGroup}"`);
      }
      groupToId.set(canonicalGroup, Number(id));
    }

    // Build stable group order:
    const groupsOrdered = Array.from(groupToId.keys()).sort((a, b) => {
      const ra = groupRank(a);
      const rb = groupRank(b);
      if (ra !== rb) return ra - rb;
      return String(a).localeCompare(String(b));
    });

    // Build optionChain in group order (1 per group)
    const optionChain = groupsOrdered.map((g) => groupToId.get(g));

    // Variant key used by /variants and your variant_option_map rows
    const variantKey = variantKeyFromOptionIds(optionChain);

    return { productId: pid, storeCode: sc, optionGroups: groupsOrdered, optionChain, variantKey };
  } finally {
    client.release();
  }
}
