// src/components/product/ProductTabs.tsx
"use client";

import { useId, useMemo, useState } from "react";
import type { Product } from "@/types/product";

type Props = {
  product: Product;
};

type TabKey = "details" | "fileprep" | "reviews";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "details", label: "Details" },
  { key: "fileprep", label: "File Prep" },
  { key: "reviews", label: "Reviews" },
];

// tiny helpers so we don’t poke unknown keys on the Product type
function getString(obj: unknown, key: string): string | undefined {
  const v = (obj as Record<string, unknown> | null)?.[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}
function getStringArray(obj: unknown, key: string): string[] | undefined {
  const v = (obj as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) as string[];
  return out.length ? out : undefined;
}

export default function ProductTabs({ product }: Props) {
  const id = useId();
  const [tab, setTab] = useState<TabKey>("details");

  // Read optional fields defensively (works whether they exist or not)
  const pAny = product as unknown;

  const details = useMemo(() => {
    const paperType = getString(pAny, "paperType");
    const coating = getString(pAny, "coating");
    const color = getString(pAny, "color");
    const sizes = getStringArray(pAny, "sizes") || getStringArray(pAny, "sizeOptions"); // allow either, if present
    const finishing = getString(pAny, "finishing");
    const fileType = getString(pAny, "fileType");
    const specialInstructions = getString(pAny, "specialInstructions");

    return { paperType, coating, color, sizes, finishing, fileType, specialInstructions };
  }, [pAny]);

  return (
    <div className="product-tabs">
      <div role="tablist" aria-label="Product information tabs" className="mb-3 flex gap-2 border-b">
        {tabs.map((t) => {
          const selected = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${id}-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`${id}-panel-${t.key}`}
              className={[
                "px-3 py-2 border-b-2 font-medium transition",
                selected ? "border-blue-700 text-blue-800" : "border-transparent text-slate-700 hover:text-slate-900",
              ].join(" ")}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {/* Details */}
        {tab === "details" ? (
          <div role="tabpanel" id={`${id}-panel-details`} aria-labelledby={`${id}-tab-details`}>
            <h3 className="mb-2 font-semibold">Product Specs</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <strong>Paper Type:</strong> {details.paperType || "See options above"}
              </li>
              <li>
                <strong>Coating:</strong> {details.coating || "—"}
              </li>
              <li>
                <strong>Color:</strong> {details.color || "Full color"}
              </li>
              <li>
                <strong>Sizes:</strong> {details.sizes?.length ? details.sizes.join(", ") : "See options above"}
              </li>
              <li>
                <strong>Finishing:</strong> {details.finishing || "—"}
              </li>
              <li>
                <strong>File Type:</strong> {details.fileType || "Print Ready PDF"}
              </li>
            </ul>

            {details.specialInstructions ? (
              <div className="mt-3 text-sm text-red-700">{details.specialInstructions}</div>
            ) : null}
          </div>
        ) : null}

        {/* File Prep */}
        {tab === "fileprep" ? (
          <div role="tabpanel" id={`${id}-panel-fileprep`} aria-labelledby={`${id}-tab-fileprep`}>
            <h3 className="mb-2 font-semibold">File Prep</h3>
            <p className="text-sm text-slate-700">
              Prepare a print-ready PDF with correct bleed and safe margins. You can also surface product-specific
              guidance you fetch from SinaLite.
            </p>
          </div>
        ) : null}

        {/* Reviews */}
        {tab === "reviews" ? (
          <div role="tabpanel" id={`${id}-panel-reviews`} aria-labelledby={`${id}-tab-reviews`}>
            <h3 className="mb-2 font-semibold">Reviews</h3>
            <p className="text-sm text-slate-700">No reviews yet. Be the first to review this product!</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
