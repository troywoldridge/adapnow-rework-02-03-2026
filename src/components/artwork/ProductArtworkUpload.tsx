"use client";

import type React from "react";
import { useCallback, useRef, useState } from "react";

type Props = {
  accept?: string;
  maxBytes?: number; // default 50MB
  label?: string;
  className?: string;
  /**
   * Optional: parent can receive the selected file (for immediate upload flows, previews, etc.)
   * If omitted, this component is just a "picker" UI.
   */
  onFile?: (file: File | null) => void;
};

function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const rounded = i === 0 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${rounded}${units[i]}`;
}

export default function ProductArtworkUpload({
  accept = "application/pdf,image/*",
  maxBytes = 50 * 1024 * 1024,
  label = "Upload your artwork",
  className = "",
  onFile,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [filename, setFilename] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const openPicker = useCallback(() => {
    setError(null);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;

      if (!file) {
        setFilename("");
        onFile?.(null);
        return;
      }

      if (maxBytes && file.size > maxBytes) {
        setFilename("");
        setError(`File is too large. Max ${humanBytes(maxBytes)}.`);
        onFile?.(null);
        // allow re-selecting same filename later
        e.currentTarget.value = "";
        return;
      }

      setFilename(file.name);
      setError(null);
      onFile?.(file);
    },
    [maxBytes, onFile],
  );

  return (
    <div className={["my-4", className].join(" ").trim()}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        type="button"
        className="mb-2 w-full rounded bg-blue-600 py-2 font-bold text-white hover:bg-blue-800 disabled:opacity-60"
        onClick={openPicker}
      >
        {filename ? `Selected: ${filename}` : label}
      </button>

      {error ? (
        <div className="text-xs text-rose-700">{error}</div>
      ) : filename ? (
        <div className="text-xs text-gray-600">PDF or image files only. Max {humanBytes(maxBytes)}.</div>
      ) : null}
    </div>
  );
}
