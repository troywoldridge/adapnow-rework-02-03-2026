"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type StripeRedirectorProps = {
  /**
   * API endpoint that returns { ok: true, url: string } to redirect to Stripe Checkout.
   * Default: /api/checkout/start
   */
  endpoint?: string;

  /**
   * Where to send the user if checkout start fails.
   * Default: /cart/review
   */
  backHref?: string;

  /**
   * Optional: show a custom message above the loader.
   */
  label?: string;

  className?: string;
};

type StartResponse =
  | { ok: true; url: string }
  | { ok: false; error?: string };

function isAbsoluteHttpUrl(u: string): boolean {
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:";
  } catch {
    return false;
  }
}

async function readJsonOrText(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json().catch(() => ({}));
  }
  const t = await res.text().catch(() => "");
  return { ok: false, error: t || `HTTP ${res.status}` };
}

export default function StripeRedirector({
  endpoint = "/api/checkout/start",
  backHref = "/cart/review",
  label = "Redirecting you to secure checkout…",
  className = "",
}: StripeRedirectorProps) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  // Prevent double-fire in React Strict Mode dev + guard unmount
  const startedRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    setBusy(true);
    setErr(null);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
      });

      const data = (await readJsonOrText(res)) as StartResponse & Record<string, any>;
      const url = typeof data?.url === "string" ? data.url : "";

      if (!res.ok || !data?.ok || !url) {
        throw new Error(data?.error || `Failed to start checkout (HTTP ${res.status})`);
      }

      // Safety: only allow absolute http(s) redirects
      if (!isAbsoluteHttpUrl(url)) {
        throw new Error("Invalid checkout URL returned by server.");
      }

      window.location.assign(url);
      return;
    } catch (e: any) {
      if (!aliveRef.current) return;
      setErr(e?.message || "Failed to start checkout");
    } finally {
      if (!aliveRef.current) return;
      setBusy(false);
      // Allow retry to re-run
      startedRef.current = false;
    }
  }, [endpoint]);

  useEffect(() => {
    void start();
  }, [start]);

  if (err) {
    return (
      <div className={`stripe-redirector ${className}`.trim()} role="alert" aria-live="polite">
        <div className="stripe-redirector__errorText">{err}</div>

        <div className="stripe-redirector__actions">
          <a className="stripe-redirector__btn stripe-redirector__btn--secondary" href={backHref}>
            Back to review
          </a>

          <button
            type="button"
            className="stripe-redirector__btn stripe-redirector__btn--primary"
            onClick={() => void start()}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`stripe-redirector__loading ${className}`.trim()} aria-busy={busy}>
      <div className="stripe-redirector__spinner" aria-hidden="true" />
      <div className="stripe-redirector__label">{label}</div>
    </div>
  );
}
