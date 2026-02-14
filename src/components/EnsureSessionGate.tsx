"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type EnsureResponse =
  | { ok: true }
  | { ok: false; error?: string };

async function readJsonSafe(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text().catch(() => "");
  return { ok: false, error: text || `HTTP ${res.status}` };
}

export default function EnsureSessionGate() {
  const router = useRouter();

  const [status, setStatus] = React.useState<"loading" | "error">("loading");
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        setStatus("loading");
        setMessage(null);

        const res = await fetch("/api/session/ensure", {
          method: "POST",
          cache: "no-store",
          signal: ac.signal,
          headers: { accept: "application/json" },
        });

        const data = (await readJsonSafe(res)) as EnsureResponse;

        // If it succeeds, refresh once so server components see the new cookie/session.
        if (res.ok && (data as any)?.ok) {
          router.refresh();
          return;
        }

        throw new Error((data as any)?.error || `Failed to prepare session (HTTP ${res.status})`);
      } catch (e: any) {
        if (e?.name === "AbortError") return;

        setStatus("error");
        setMessage(e?.message || "Failed to prepare your session.");
      }
    })();

    return () => ac.abort();
  }, [router]);

  return (
    <main className="session-gate" aria-busy={status === "loading"}>
      <div className="session-gate__card">
        <h1 className="session-gate__title">Preparing upload…</h1>

        {status === "loading" ? (
          <>
            <p className="session-gate__muted">
              Setting up your session so we can attach files to your cart.
            </p>
            <div className="session-gate__bar" aria-hidden="true" />
            <p className="session-gate__hint">This usually takes a moment.</p>
          </>
        ) : (
          <>
            <p className="session-gate__error" role="status">
              {message || "We couldn’t prepare your session."}
            </p>

            <div className="session-gate__actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>

              <a className="btn btn-secondary btn-sm" href="/cart/review">
                Back to cart
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
