// src/components/product/ProductOptionSelector.tsx
"use client";

import { useMemo } from "react";

export interface Option {
  id: number;
  name: string;
}

type Props = {
  /** A map of option-group name to its list of options */
  optionGroups: Record<string, Option[]>;
  /** Currently selected option ID per group (in the same order as groupNames below) */
  selectedOptions: number[];
  /** Setter to update the selectedOptions array */
  setSelectedOptions: (options: number[]) => void;
};

function safeId(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

export default function ProductOptionSelector({ optionGroups, selectedOptions, setSelectedOptions }: Props) {
  const groupNames = useMemo(() => Object.keys(optionGroups || {}), [optionGroups]);

  const handleChange = (groupIndex: number, nextId: number | null) => {
    const updated = Array.isArray(selectedOptions) ? [...selectedOptions] : [];
    // Ensure array is long enough
    while (updated.length < groupNames.length) updated.push(0);

    updated[groupIndex] = nextId ?? 0;
    setSelectedOptions(updated);
  };

  return (
    <div className="space-y-6">
      {groupNames.map((groupName, index) => {
        const options = optionGroups[groupName] || [];
        const selected = selectedOptions?.[index] ?? 0;

        return (
          <div key={groupName}>
            <label htmlFor={`opt-${groupName}`} className="mb-1 block text-sm font-medium text-gray-700">
              {groupName}
            </label>

            <select
              id={`opt-${groupName}`}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent"
              value={selected > 0 ? String(selected) : ""}
              onChange={(e) => handleChange(index, safeId(e.currentTarget.value))}
            >
              <option value="">Select {groupName}</option>
              {options.map((opt) => (
                <option key={opt.id} value={String(opt.id)}>
                  {opt.name}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
