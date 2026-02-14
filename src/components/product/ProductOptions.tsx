// src/components/product/ProductOptions.tsx
"use client";

import { useCallback, useMemo } from "react";

/** Match your SinaLite-normalized shapes */
export type OptionDef = {
  name: string; // e.g. "Size", "Stock", "Coating"
  code: string; // e.g. "size", "stock", "coating" (maps to SinaLite field)
  values: Array<{ label: string; value: string }>;
};

export type Selected = Record<string, string>; // { size: "12x18", stock: "14pt", ... }

type Props = {
  options: OptionDef[]; // from SinaLite options endpoint for this product
  selected: Selected; // your current selections
  qty: number; // run size / quantity (per SinaLite)
  onChange: (next: { selected: Selected; qty: number }) => void; // bubble changes up
  disabled?: boolean;
};

function clampInt(n: number, min: number, max: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.floor(x)));
}

export default function ProductOptions({ options, selected, qty, onChange, disabled = false }: Props) {
  // Normalize selections: ensure every option group has *some* selection (first value) if missing.
  const normalizedSelected = useMemo(() => {
    const init: Selected = { ...(selected || {}) };
    for (const g of options || []) {
      if (init[g.code] == null && g.values?.length) init[g.code] = g.values[0].value;
    }
    return init;
  }, [options, selected]);

  const onSelect = useCallback(
    (code: string, value: string) => {
      onChange({ selected: { ...normalizedSelected, [code]: value }, qty: clampInt(qty, 1, 999999) });
    },
    [normalizedSelected, onChange, qty],
  );

  const onQtyChange = useCallback(
    (raw: string) => {
      const nextQty = clampInt(Number(raw || 0), 1, 999999);
      onChange({ selected: normalizedSelected, qty: nextQty });
    },
    [normalizedSelected, onChange],
  );

  return (
    <div className="space-y-3">
      {(options || []).map((group) => (
        <div key={group.code}>
          <label className="mb-1 block font-medium">{group.name}</label>
          <select
            value={normalizedSelected[group.code] ?? ""}
            disabled={disabled}
            onChange={(e) => onSelect(group.code, e.currentTarget.value)}
            className="w-full rounded border px-3 py-2"
          >
            {(group.values || []).map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      <div>
        <label className="mb-1 block font-medium">Qty</label>
        <input
          type="number"
          min={1}
          max={999999}
          value={clampInt(qty, 1, 999999)}
          disabled={disabled}
          onChange={(e) => onQtyChange(e.currentTarget.value)}
          className="w-full rounded border px-3 py-2"
          inputMode="numeric"
        />
      </div>
    </div>
  );
}
