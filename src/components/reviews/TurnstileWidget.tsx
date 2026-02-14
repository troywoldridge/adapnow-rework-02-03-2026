// src/components/reviews/TurnstileWidget.tsx
"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact";
          appearance?: "always" | "execute" | "interaction-only";
        },
      ) => string | number;
      reset?: (widgetId?: string | number) => void;
      remove?: (widgetId: string | number) => void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  // Already available
  if (window.turnstile) return Promise.resolve();

  // Already loading/loaded
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    // Avoid duplicates if something else added it
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
    );
    if (existing) {
      if (window.turnstile) resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Turnstile script failed to load")), {
          once: true,
        });
      }
      return;
    }

    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(s);
  });

  return turnstileScriptPromise;
}

type Props = {
  siteKey: string;
  onVerify: (token: string) => void;
  className?: string;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
  appearance?: "always" | "execute" | "interaction-only";
};

export default function TurnstileWidget({
  siteKey,
  onVerify,
  className,
  theme = "auto",
  size = "normal",
  appearance = "always",
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      try {
        await loadTurnstileScript();
        if (cancelled) return;

        const el = boxRef.current;
        const ts = window.turnstile;
        if (!el || !ts) return;

        // If re-mounting / changing site key, clean up prior widget
        if (widgetIdRef.current != null && ts.remove) {
          try {
            ts.remove(widgetIdRef.current);
          } catch {}
          widgetIdRef.current = null;
        }

        // Render fresh widget
        const wid = ts.render(el, {
          sitekey: siteKey,
          theme,
          size,
          appearance,
          callback: (token) => onVerify(token),
          "expired-callback": () => onVerify(""),
          "error-callback": () => onVerify(""),
        });

        widgetIdRef.current = wid;
      } catch {
        // Script failed to load — treat as unverified
        onVerify("");
      }
    }

    void mount();

    return () => {
      cancelled = true;
      const ts = window.turnstile;
      const wid = widgetIdRef.current;
      if (ts && wid != null) {
        // remove preferred, reset fallback
        try {
          ts.remove?.(wid);
        } catch {
          try {
            ts.reset?.(wid);
          } catch {}
        }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, onVerify, theme, size, appearance]);

  return <div ref={boxRef} className={className} />;
}
