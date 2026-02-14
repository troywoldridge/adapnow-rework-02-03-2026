"use client";

import Link from "next/link";

type Props = {
  productId: number | string;
  lineId: string;
  currentSides: number;
  label?: string;
  className?: string;
};

export default function AddAnotherSideButton({
  productId,
  lineId,
  currentSides,
  label,
  className,
}: Props) {
  const nextSide = Math.max(0, Number(currentSides) || 0) + 1;

  const pid = encodeURIComponent(String(productId));
  const href =
    `/product/${pid}/upload-artwork` +
    `?lineId=${encodeURIComponent(lineId)}` +
    `&sides=${encodeURIComponent(String(nextSide))}` +
    `&focusSide=${encodeURIComponent(String(nextSide))}` +
    `#side-${encodeURIComponent(String(nextSide))}`;

  return (
    <Link
      href={href}
      className={[
        "inline-flex items-center rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100",
        className ?? "",
      ].join(" ")}
    >
      {label ?? "+ Add another side"}
    </Link>
  );
}
