"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function safeReturnTo(input: string | null): string {
  // Prevent open-redirects: only allow same-site relative paths.
  // Accept: "/account", "/cart?x=1", "/products/123#details"
  const v = (input || "").trim();
  if (!v) return "/";
  if (!v.startsWith("/")) return "/";
  if (v.startsWith("//")) return "/";
  return v;
}

export default function OnboardingClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const returnTo = useMemo(() => safeReturnTo(sp.get("returnTo")), [sp]);

  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function completeOnboarding(e: React.FormEvent) {
    e.preventDefault();
    if (busy || done) return;

    setBusy(true);
    setError(null);

    try {
      // Save minimal profile bits. Keep endpoint consistent with your app’s "me" pattern.
      const res = await fetch("/api/me/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marketingOptIn }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Save failed (${res.status})`);
      }

      setDone(true);

      // Small UX pause, then route (no full reload).
      window.setTimeout(() => {
        router.replace(returnTo || "/");
      }, 450);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Welcome! Let’s finish your setup.</h1>
        <p className="mt-2 text-gray-600">
          This helps speed up checkout and personalize your experience.
        </p>

        <form onSubmit={completeOnboarding} className="mt-6 space-y-4" aria-busy={busy}>
          <div className="flex items-start gap-3">
            <input
              id="marketingOptIn"
              name="marketingOptIn"
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="mt-1 h-4 w-4"
              disabled={busy || done}
            />
            <div>
              <label htmlFor="marketingOptIn" className="text-sm font-medium text-gray-900">
                Yes, send me occasional promos and tips.
              </label>
              <p className="mt-1 text-xs text-gray-500">
                You can change this anytime in your account settings.
              </p>
            </div>
          </div>

          {error && (
            <div
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || done}
              className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {done ? "All set! Redirecting…" : busy ? "Saving…" : "Finish"}
            </button>

            <span className="text-xs text-gray-500" aria-live="polite">
              {busy ? "Saving your preferences…" : done ? "Taking you back…" : null}
            </span>
          </div>
        </form>

        <p className="mt-4 text-xs text-gray-500">
          Images are delivered via Cloudflare; pricing and fulfillment integrate with the SinaLite
          API. 🚀
        </p>
      </div>
    </main>
  );
}
