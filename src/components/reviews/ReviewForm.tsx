// src/components/reviews/ReviewForm.tsx
"use client";

import { useMemo, useState } from "react";
import TurnstileWidget from "./TurnstileWidget";
import { apiJson } from "@/lib/reviews/client-utils";

type Props = {
  productId: string;
  turnstileSiteKey: string;
  onSubmitted?: () => void;
};

function clampInt(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.min(max, Math.max(min, x));
}

export default function ReviewForm({ productId, turnstileSiteKey, onSubmitted }: Props) {
  const [turnstileToken, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const canSubmit = useMemo(() => !busy && Boolean(turnstileToken), [busy, turnstileToken]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(false);

    const form = e.currentTarget;
    const fd = new FormData(form);

    const name = String(fd.get("name") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const rating = clampInt(Number(fd.get("rating") || 0), 0, 5);
    const comment = String(fd.get("comment") || "").trim();
    const termsAgreed = fd.get("terms") === "on";
    const website = String(fd.get("website") || "").trim(); // honeypot

    // Client-side validation (server MUST still validate).
    if (!name) return setErr("Please enter your name.");
    if (!termsAgreed) return setErr("You must agree to the review terms.");
    if (!turnstileToken) return setErr("Please complete the anti-spam check.");
    if (rating < 1 || rating > 5) return setErr("Please choose a rating from 1 to 5.");
    if (comment.length < 5) return setErr("Please add a bit more detail (at least 5 characters).");
    if (comment.length > 2000) return setErr("Please keep your review under 2000 characters.");

    const payload = {
      name,
      email: email || undefined,
      rating,
      comment,
      termsAgreed,
      turnstileToken,
      website, // honeypot (server should reject if present)
    };

    try {
      setBusy(true);

      await apiJson(`/api/products/${encodeURIComponent(productId)}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      setOk(true);
      form.reset();
      setToken(""); // require a fresh token for the next submission
      onSubmitted?.();
    } catch (e: any) {
      setErr(e?.message || "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-live="polite">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          name="name"
          required
          placeholder="Your name"
          autoComplete="name"
          className="h-11 rounded-md bg-white/5 px-3 ring-1 ring-white/10"
        />
        <input
          name="email"
          type="email"
          placeholder="Email (optional)"
          autoComplete="email"
          className="h-11 rounded-md bg-white/5 px-3 ring-1 ring-white/10"
        />
      </div>

      <select
        name="rating"
        required
        defaultValue=""
        className="h-11 w-full rounded-md bg-white/5 px-3 ring-1 ring-white/10"
        aria-label="Rating"
      >
        <option value="" disabled>
          Rating
        </option>
        <option value="5">★★★★★ – 5</option>
        <option value="4">★★★★☆ – 4</option>
        <option value="3">★★★☆☆ – 3</option>
        <option value="2">★★☆☆☆ – 2</option>
        <option value="1">★☆☆☆☆ – 1</option>
      </select>

      <textarea
        name="comment"
        required
        minLength={5}
        maxLength={2000}
        placeholder="Share details that will help other buyers…"
        className="min-h-28 w-full rounded-md bg-white/5 px-3 py-2 ring-1 ring-white/10"
      />

      {/* Honeypot: real users won’t fill this (server should reject if non-empty). */}
      <div className="sr-only" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="terms" required /> <span>I agree to the review terms.</span>
      </label>

      <TurnstileWidget siteKey={turnstileSiteKey} onVerify={setToken} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="h-11 rounded-lg bg-[#0047ab] px-5 font-semibold hover:bg-[#003a8f] disabled:opacity-60"
        >
          {busy ? "Submitting…" : "Submit review"}
        </button>

        {ok ? <span className="text-emerald-400 text-sm">Thanks! Submitted.</span> : null}
        {err ? <span className="text-red-400 text-sm">{err}</span> : null}

        {!turnstileToken && !busy ? (
          <span className="text-xs text-white/60">Complete the anti-spam check to enable submit.</span>
        ) : null}
      </div>
    </form>
  );
}
