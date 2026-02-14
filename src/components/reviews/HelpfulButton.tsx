// src/components/reviews/HelpfulButton.tsx
"use client";

import { useEffect, useState } from "react";
import { apiJson, getPersistentFingerprint } from "@/lib/reviews/client-utils";

type Props = {
  reviewId: number;
  initiallyVoted: boolean;
  onVoted?: (votes: number) => void;
};

export default function HelpfulButton({ reviewId, initiallyVoted, onVoted }: Props) {
  const [voted, setVoted] = useState(Boolean(initiallyVoted));
  const [busy, setBusy] = useState(false);

  // If parent changes initiallyVoted (e.g., hydration, refetch), keep local state in sync.
  useEffect(() => {
    setVoted(Boolean(initiallyVoted));
  }, [initiallyVoted]);

  const click = async () => {
    if (busy || voted) return;

    setBusy(true);
    try {
      const fingerprint = getPersistentFingerprint();

      const data = await apiJson<{ votes: number }>(`/api/reviews/${reviewId}/helpful`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fingerprint }),
      });

      setVoted(true);
      onVoted?.(Number(data?.votes ?? 0));
    } catch (e) {
      // Keep UI quiet (no toast here), but log for debugging.
      console.error("Helpful vote failed:", e);
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || voted;

  return (
    <button
      type="button"
      onClick={click}
      disabled={disabled}
      className={[
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ring-1 ring-white/15",
        disabled ? "opacity-60 cursor-default" : "hover:bg-white/10",
      ].join(" ")}
      aria-pressed={voted}
      aria-label={voted ? "Marked as helpful" : "Mark this review as helpful"}
    >
      <span aria-hidden="true">👍</span>
      <span>Helpful</span>
      {voted ? <span aria-hidden="true">✓</span> : null}
    </button>
  );
}
