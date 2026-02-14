// src/components/ChunkErrorRecovery.tsx
"use client";

import * as React from "react";

type Props = {
  children: React.ReactNode;
};

/**
 * ChunkErrorRecovery
 *
 * Handles "ChunkLoadError" / "Loading chunk ... failed" situations that happen after deployments
 * when a client has old cached JS and tries to load a now-missing chunk.
 *
 * Behavior:
 * - Detect via `error` + `unhandledrejection`
 * - Auto-reload ONCE per session (best for conversions)
 * - If still failing, show a friendly full-screen recovery UI with Retry
 */

const SESSION_KEY = "adap:chunk_reload_attempted_v1";

function isChunkLoadFailure(err: unknown, messageFallback = ""): boolean {
  const msg = String(messageFallback || "").toLowerCase();

  const anyErr = err as any;
  const name = String(anyErr?.name || "").toLowerCase();
  const message = String(anyErr?.message || "").toLowerCase();

  // Common patterns across browsers/frameworks
  if (name.includes("chunkloaderror")) return true;
  if (message.includes("loading chunk") && message.includes("failed")) return true;
  if (msg.includes("loading chunk") && msg.includes("failed")) return true;

  // Next.js / webpack sometimes includes these:
  if (message.includes("chunk") && message.includes("load") && message.includes("error")) return true;
  if (msg.includes("chunk") && msg.includes("load") && msg.includes("error")) return true;

  // Network edge: "failed to fetch dynamically imported module" (Vite-ish but can occur)
  if (message.includes("dynamically imported module") && message.includes("failed")) return true;
  if (msg.includes("dynamically imported module") && msg.includes("failed")) return true;

  return false;
}

class Boundary extends React.Component<
  { onError: (err: unknown) => void; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Let parent decide what to do (we only handle chunk-ish errors)
    try {
      this.props.onError(error);
    } catch {
      // ignore
    }

    // Still log; this helps you see real issues too
    console.error("ChunkErrorRecovery boundary caught:", error, info);
  }

  render() {
    // If the boundary tripped, we hide children and let parent show UI if it was a chunk failure.
    // For non-chunk errors, you should rely on Next.js error boundaries/pages.
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default function ChunkErrorRecovery({ children }: Props) {
  const [chunkError, setChunkError] = React.useState(false);
  const [retryKey, setRetryKey] = React.useState(0);

  const trigger = React.useCallback((err: unknown, messageFallback?: string) => {
    if (!isChunkLoadFailure(err, messageFallback || "")) return;

    // Auto-reload once per session to recover silently (best for conversion)
    try {
      const attempted = sessionStorage.getItem(SESSION_KEY) === "1";
      if (!attempted) {
        sessionStorage.setItem(SESSION_KEY, "1");
        window.location.reload();
        return;
      }
    } catch {
      // If sessionStorage fails, fall through to UI
    }

    setChunkError(true);
  }, []);

  React.useEffect(() => {
    const onError = (e: ErrorEvent) => {
      trigger(e.error, e.message || "");
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      trigger(e.reason, "");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [trigger]);

  const retry = React.useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    setChunkError(false);
    setRetryKey((k) => k + 1);

    // Hard reload is the most reliable fix
    window.location.reload();
  }, []);

  if (chunkError) {
    return (
      <div className="chunk-recovery" role="alert" aria-live="polite">
        <div className="chunk-recovery__card">
          <div className="chunk-recovery__badge" aria-hidden="true">!</div>
          <h2 className="chunk-recovery__title">Update needed</h2>
          <p className="chunk-recovery__text">
            A new version of the site is available, and your browser tried to load an older file.
            Reloading fixes it.
          </p>
          <div className="chunk-recovery__actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={retry}>
              Reload
            </button>
          </div>
          <p className="chunk-recovery__hint">
            If this keeps happening, try a hard refresh (Ctrl/⌘ + Shift + R).
          </p>
        </div>
      </div>
    );
  }

  return (
    <Boundary onError={(err) => trigger(err)}>
      {/* retryKey makes it easy to remount children after a recovery */}
      <React.Fragment key={retryKey}>{children}</React.Fragment>
    </Boundary>
  );
}
