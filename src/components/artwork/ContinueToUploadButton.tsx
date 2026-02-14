// src/components/ContinueToUploadButton.tsx
"use client";

import Link from "next/link";

type Props = {
  productId: string | number;
  orderId: string;
  sides?: number;
  className?: string;
  label?: string;
};

export default function ContinueToUploadButton({
  productId,
  orderId,
  sides = 1,
  className = "btn btn-primary",
  label = "Upload your artwork",
}: Props) {
  const pid = encodeURIComponent(String(productId));
  const href =
    `/product/${pid}/upload-artwork` +
    `?sides=${encodeURIComponent(String(sides))}` +
    `&orderId=${encodeURIComponent(orderId)}`;

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}
