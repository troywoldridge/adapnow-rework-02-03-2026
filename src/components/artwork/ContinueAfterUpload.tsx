"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const ARTWORK_UPLOADED_EVENT = "adap:artworkUploaded";

type Props = {
  href: string;
  label?: string;
  helperText?: string;
  className?: string;
  /**
   * Optional: if you already know an upload exists (e.g. server/cart state),
   * you can start enabled without waiting for the event.
   */
  initialOk?: boolean;
};

export default function ContinueAfterUpload({
  href,
  label = "Continue to Cart",
  helperText = "Upload at least one file to continue.",
  className = "btn btn-primary",
  initialOk = false,
}: Props) {
  const [ok, setOk] = useState<boolean>(initialOk);

  useEffect(() => {
    function onUploaded() {
      setOk(true);
    }

    // Listen for a custom event fired by the upload flow
    window.addEventListener(ARTWORK_UPLOADED_EVENT, onUploaded);
    return () => window.removeEventListener(ARTWORK_UPLOADED_EVENT, onUploaded);
  }, []);

  if (!ok) {
    return <p className="mt-3 text-neutral-600">{helperText}</p>;
  }

  return (
    <Link
      href={href}
      className={className}
      aria-disabled={!ok}
      onClick={(e) => {
        if (!ok) e.preventDefault();
      }}
    >
      {label}
    </Link>
  );
}
