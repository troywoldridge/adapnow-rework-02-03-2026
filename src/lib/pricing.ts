import "server-only";

export type Store = "US" | "CA";

type ApplyLevel = "line" | "unit";

export type Tier = {
  /** inclusive min quantity */
  min: number;
  /** inclusive max quantity (null = infinity) */
  max: number | null;
  /** multiplier applied to cost */
  mult: number;
  /** optional per-tier minimum margin floor (0..0.95) */
  floorPct?: number;
};

type MarkupConfig = {
  defaultMultUS: number;
  defaultMultCA: number;
  globalFloorPct: number; // 0..0.95
  applyLevel: ApplyLevel;
  useCharm99: boolean;
  tiersUS: Tier[];
  tiersCA: Tier[];
};

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function toNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function readNum(env: string | undefined, fallback: number): number {
  const n = toNumber(env);
  return n == null ? fallback : n;
}

function readBool(env: string | undefined, fallback: boolean): boolean {
  if (env == null) return fallback;
  const v = s(env).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function readApplyLevel(env: string | undefined, fallback: ApplyLevel): ApplyLevel {
  const v = s(env).toLowerCase();
  if (v === "unit") return "unit";
  if (v === "line") return "line";
  return fallback;
}

function parseTiers(jsonStr: string | undefined, fallbackMult: number): Tier[] {
  const raw = s(jsonStr);
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const tiers: Tier[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;

    const o = item as Record<string, unknown>;

    const min = Math.max(1, Math.floor(toNumber(o.min) ?? 1));
    const maxRaw = o.max;
    const max =
      maxRaw == null ? null : Math.max(1, Math.floor(toNumber(maxRaw) ?? min));

    const mult = toNumber(o.mult) ?? fallbackMult;
    if (!Number.isFinite(mult) || mult <= 0) continue;

    const floorPctRaw = o.floorPct;
    const floorPct =
      floorPctRaw == null ? undefined : clamp(toNumber(floorPctRaw) ?? 0, 0, 0.95);

    tiers.push({ min, max, mult, ...(floorPct != null ? { floorPct } : {}) });
  }

  tiers.sort((a, b) => a.min - b.min);
  return tiers;
}

function loadConfig(): MarkupConfig {
  const defaultMultUS = readNum(process.env.DEFAULT_MARKUP_MULTIPLIER_US, 1.6);
  const defaultMultCA = readNum(process.env.DEFAULT_MARKUP_MULTIPLIER_CA, 1.6);

  const globalFloorPct = clamp(readNum(process.env.MIN_MARGIN_PCT, 0), 0, 0.95);

  const applyLevel = readApplyLevel(process.env.MARKUP_APPLY_LEVEL, "line");
  const useCharm99 = readBool(process.env.MARKUP_USE_DOT_99, false);

  const tiersUS = parseTiers(process.env.MARKUP_TIERS_US, defaultMultUS);
  const tiersCA = parseTiers(process.env.MARKUP_TIERS_CA, defaultMultCA);

  return {
    defaultMultUS,
    defaultMultCA,
    globalFloorPct,
    applyLevel,
    useCharm99,
    tiersUS,
    tiersCA,
  };
}

// Load once; env changes require restart (expected for server config)
const CFG = loadConfig();

function tiersFor(store: Store): Tier[] {
  return store === "CA" ? CFG.tiersCA : CFG.tiersUS;
}

function fallbackMultFor(store: Store): number {
  return store === "CA" ? CFG.defaultMultCA : CFG.defaultMultUS;
}

function pickTier(qty: number, tiers: Tier[], fallbackMult: number): Tier {
  const q = Math.max(1, Math.floor(qty || 1));
  for (const t of tiers) {
    const hi = t.max == null ? Infinity : t.max;
    if (q >= t.min && q <= hi) return t;
  }
  return { min: 1, max: null, mult: fallbackMult };
}

function applyMinMargin(sellCents: number, costCents: number, floorPct: number): number {
  const sell = Math.round(sellCents);
  if (!(floorPct > 0) || costCents <= 0) return sell;

  // sell >= cost / (1 - floorPct)
  const floorSell = Math.ceil(costCents / (1 - floorPct));
  return Math.max(sell, floorSell);
}

function charm99(cents: number): number {
  const v = Math.round(cents);
  if (!CFG.useCharm99) return v;

  // Don’t charm small prices; avoid weird $0.99 outcomes
  if (v < 1000) return v;

  const dollars = Math.floor(v / 100);
  const target = dollars * 100 + 99;
  return target >= v ? target : (dollars + 1) * 100 + 99;
}

function normalizeCosts(params: { quantity: number; lineCostCents?: number; unitCostCents?: number }) {
  const quantity = Math.max(1, Math.floor(Number(params.quantity) || 1));

  let lineCostCents = Math.max(0, Math.round(Number(params.lineCostCents ?? 0) || 0));
  if (!lineCostCents) {
    const unit = Math.max(0, Math.round(Number(params.unitCostCents ?? 0) || 0));
    lineCostCents = unit * quantity;
  }

  const unitCostCents = quantity > 0 ? Math.round(lineCostCents / quantity) : lineCostCents;

  return { quantity, lineCostCents, unitCostCents };
}

/** Optional debug info for pricing explanations (useful for admin tooling later). */
export type MarkupDebug = {
  store: Store;
  quantity: number;
  applyLevel: ApplyLevel;
  chosenTier: Tier;
  multiplier: number;
  floorPct: number;
  usedCharm99: boolean;
  lineCostCents: number;
  unitCostCents: number;
  rawUnitSellCents: number;
  rawLineSellCents: number;
  finalUnitSellCents: number;
  finalLineSellCents: number;
};

/**
 * Main export: apply tiered markup.
 * Recommended applyLevel = "line" for most print pricing (line is authoritative).
 */
export async function applyTieredMarkup(params: {
  store: Store;
  quantity: number;
  lineCostCents?: number;
  unitCostCents?: number;
  /** If true, include debug payload (no DB calls; safe) */
  debug?: boolean;
}): Promise<{ unitSellCents: number; lineSellCents: number; debug?: MarkupDebug }> {
  const { quantity, lineCostCents, unitCostCents } = normalizeCosts(params);

  const fallbackMult = fallbackMultFor(params.store);
  const chosenTier = pickTier(quantity, tiersFor(params.store), fallbackMult);

  const mult = Number.isFinite(chosenTier.mult) && chosenTier.mult > 0 ? chosenTier.mult : fallbackMult;
  const floorPct = chosenTier.floorPct != null ? chosenTier.floorPct : CFG.globalFloorPct;

  if (CFG.applyLevel === "line") {
    const rawLineSellCents = Math.round(lineCostCents * mult);
    const flooredLineSellCents = applyMinMargin(rawLineSellCents, lineCostCents, floorPct);
    const charmedLineSellCents = charm99(flooredLineSellCents);

    // Ensure unit*qty == line (no drift)
    const finalLineSellCents = Math.max(0, Math.round(charmedLineSellCents));
    const finalUnitSellCents = quantity > 0 ? Math.floor(finalLineSellCents / quantity) : finalLineSellCents;

    // Recompose line from unit to keep cart math stable
    const recomposedLine = finalUnitSellCents * quantity;

    const unitSellCents = finalUnitSellCents;
    const lineSellCents = recomposedLine;

    if (params.debug) {
      return {
        unitSellCents,
        lineSellCents,
        debug: {
          store: params.store,
          quantity,
          applyLevel: CFG.applyLevel,
          chosenTier,
          multiplier: mult,
          floorPct,
          usedCharm99: CFG.useCharm99,
          lineCostCents,
          unitCostCents,
          rawUnitSellCents: Math.round(unitCostCents * mult),
          rawLineSellCents,
          finalUnitSellCents: unitSellCents,
          finalLineSellCents: lineSellCents,
        },
      };
    }

    return { unitSellCents, lineSellCents };
  }

  // unit-level apply
  const rawUnitSellCents = Math.round(unitCostCents * mult);
  const flooredUnitSellCents = applyMinMargin(rawUnitSellCents, unitCostCents, floorPct);
  const finalUnitSellCents = Math.max(0, charm99(flooredUnitSellCents));

  const unitSellCents = finalUnitSellCents;
  const lineSellCents = unitSellCents * quantity;

  if (params.debug) {
    return {
      unitSellCents,
      lineSellCents,
      debug: {
        store: params.store,
        quantity,
        applyLevel: CFG.applyLevel,
        chosenTier,
        multiplier: mult,
        floorPct,
        usedCharm99: CFG.useCharm99,
        lineCostCents,
        unitCostCents,
        rawUnitSellCents,
        rawLineSellCents: Math.round(lineCostCents * mult),
        finalUnitSellCents: unitSellCents,
        finalLineSellCents: lineSellCents,
      },
    };
  }

  return { unitSellCents, lineSellCents };
}
