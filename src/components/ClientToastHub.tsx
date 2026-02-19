"use client";

import * as React from "react";

type ToastKind = "info" | "success" | "error";

type Toast = {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  createdAt: number;
  ttlMs: number;
};

type ToastInput = {
  kind?: ToastKind;
  title?: string;
  message: string;
  ttlMs?: number;
};

function uid() {
  // good enough for UI ids
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const ToastCtx = React.createContext<{
  push: (t: ToastInput) => void;
  dismiss: (id: string) => void;
} | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) {
    // Safe fallback: no-op in case someone renders outside the provider
    return {
      push: (_t: ToastInput) => {},
      dismiss: (_id: string) => {},
    };
  }
  return ctx;
}

/**
 * ClientToastHub
 * - Put this once near the root (layout or top-level page).
 * - Use useToast().push({ message }) in other client components.
 */
export default function ClientToastHub() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback((input: ToastInput) => {
    const t: Toast = {
      id: uid(),
      kind: input.kind ?? "info",
      title: input.title,
      message: input.message,
      createdAt: Date.now(),
      ttlMs: Math.max(1500, Math.min(15000, Number(input.ttlMs ?? 4500))),
    };
    setToasts((prev) => [...prev, t]);
  }, []);

  // auto-dismiss
  React.useEffect(() => {
    if (!toasts.length) return;
    const now = Date.now();
    const timers = toasts.map((t) => {
      const remaining = Math.max(0, t.createdAt + t.ttlMs - now);
      return window.setTimeout(() => dismiss(t.id), remaining);
    });
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [toasts, dismiss]);

  return (
    <ToastCtx.Provider value={{ push, dismiss }}>
      {/* Render children nowhere here; this is just the hub */}
      <div
        aria-live="polite"
        aria-relevant="additions removals"
        className="fixed right-4 top-4 z-[9999] flex w-[min(92vw,420px)] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="rounded-xl border bg-white p-3 shadow-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {t.kind === "success" ? "✅" : t.kind === "error" ? "⚠️" : "ℹ️"}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {t.title ?? (t.kind === "success" ? "Success" : t.kind === "error" ? "Error" : "Notice")}
                    </div>
                  </div>
                </div>
                <div className="mt-1 text-sm text-gray-700 break-words">{t.message}</div>
              </div>

              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* This component is meant to be mounted as a “hub”.
          It does not render children; consumers render normally elsewhere. */}
    </ToastCtx.Provider>
  );
}
