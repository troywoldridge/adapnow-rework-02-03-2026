"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type NoticeTone = "info" | "warn" | "success";
type NoticeVariant = "solid" | "glass";

export type NoticeTextPart =
  | string
  | {
      text: string;
      href: string;
      external?: boolean;
      newTab?: boolean;
      ariaLabel?: string;
    };

export type NoticeCta = {
  text: string;
  href: string;
  external?: boolean;
  newTab?: boolean;
  ariaLabel?: string;
};

export type NoticeAnalyticsEvent =
  | { type: "impression"; storageKey: string }
  | { type: "dismiss"; storageKey: string }
  | { type: "link_click"; storageKey: string; href: string; text: string; position: "inline" | "cta" };

export type NotificationBarProps = {
  message?: string;
  messageParts?: NoticeTextPart[];

  /** Optional CTA pill button on the right */
  cta?: NoticeCta | null;

  icon?: string;
  tone?: NoticeTone;

  /**
   * Visual treatment:
   * - solid: strong gradient background
   * - glass: premium frosted overlay (looks expensive)
   * Default: solid
   */
  variant?: NoticeVariant;

  dismissForMs?: number;
  storageKey?: string;

  /**
   * Optional analytics callback.
   * You can wire this to your analytics pipeline later.
   */
  onEvent?: (ev: NoticeAnalyticsEvent) => void;

  className?: string;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function readDismissedAt(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { dismissedAt?: number } | null;
    const ts = parsed?.dismissedAt;
    return typeof ts === "number" && Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

function writeDismissedAt(key: string, ts: number) {
  try {
    localStorage.setItem(key, JSON.stringify({ dismissedAt: ts }));
  } catch {
    // ignore
  }
}

function defaultIcon(tone: NoticeTone): string {
  if (tone === "success") return "✅";
  if (tone === "info") return "ℹ️";
  return "⚠️";
}

function safeText(x: unknown): string {
  return String(x ?? "").trim();
}

function isSafeHref(href: string): boolean {
  const s = href.trim();
  if (!s) return false;
  if (s.startsWith("/")) return true;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeLink<T extends { text: string; href: string; external?: boolean; newTab?: boolean; ariaLabel?: string }>(
  input: T | null | undefined
): (T & { text: string; href: string }) | null {
  if (!input) return null;
  const text = safeText(input.text);
  const href = safeText(input.href);
  if (!text || !isSafeHref(href)) return null;
  return { ...input, text, href };
}

export default function NotificationBar({
  message = "We are currently experiencing high volumes. Thank you for your patience!",
  messageParts,
  cta = null,
  icon,
  tone = "warn",
  variant = "solid",
  dismissForMs = ONE_DAY_MS,
  storageKey = "adap_notice_dismissed_v1",
  onEvent,
  className = "",
}: NotificationBarProps) {
  const [show, setShow] = useState(false);

  const chosenIcon = useMemo(() => icon ?? defaultIcon(tone), [icon, tone]);

  const parts = useMemo<NoticeTextPart[]>(() => {
    if (Array.isArray(messageParts) && messageParts.length) return messageParts;
    const m = safeText(message);
    return m ? [m] : [];
  }, [messageParts, message]);

  const ctaNorm = useMemo(() => normalizeLink(cta), [cta]);

  // Fire impression once per mount when shown
  const impressionFiredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const dismissedAt = readDismissedAt(storageKey);
    if (!dismissedAt) {
      setShow(true);
      return;
    }

    const ttl = Math.max(60_000, Math.floor(Number(dismissForMs) || ONE_DAY_MS));
    if (Date.now() - dismissedAt > ttl) setShow(true);
  }, [storageKey, dismissForMs]);

  useEffect(() => {
    if (!show) return;
    if (impressionFiredRef.current) return;
    impressionFiredRef.current = true;
    onEvent?.({ type: "impression", storageKey });
  }, [show, onEvent, storageKey]);

  const dismiss = useCallback(() => {
    setShow(false);
    onEvent?.({ type: "dismiss", storageKey });

    if (typeof window === "undefined") return;
    writeDismissedAt(storageKey, Date.now());
  }, [storageKey, onEvent]);

  const trackLink = useCallback(
    (href: string, text: string, position: "inline" | "cta") => {
      onEvent?.({ type: "link_click", storageKey, href, text, position });
    },
    [onEvent, storageKey]
  );

  if (!show) return null;
  if (!parts.length) return null;

  const toneClass =
    tone === "success"
      ? "notice-bar--success"
      : tone === "info"
      ? "notice-bar--info"
      : "notice-bar--warn";

  const variantClass = variant === "glass" ? "notice-bar--glass" : "notice-bar--solid";

  return (
    <div
      className={`notice-bar ${toneClass} ${variantClass} ${className}`.trim()}
      role="status"
      aria-live="polite"
      data-notice-bar
    >
      <div className="notice-bar__inner">
        <div className="notice-bar__msg">
          <span className="notice-bar__icon" aria-hidden="true">
            {chosenIcon}
          </span>

          <p className="notice-bar__text">
            {parts.map((p, i) => {
              if (typeof p === "string") return <span key={i}>{p}</span>;

              const norm = normalizeLink(p);
              if (!norm) return <span key={i}>{safeText((p as any)?.text)}</span>;

              const rel = norm.external || norm.newTab ? "noopener noreferrer" : undefined;
              const target = norm.newTab ? "_blank" : undefined;

              return (
                <a
                  key={i}
                  href={norm.href}
                  className="notice-bar__link"
                  aria-label={norm.ariaLabel}
                  rel={rel}
                  target={target}
                  onClick={() => trackLink(norm.href, norm.text, "inline")}
                >
                  {norm.text}
                </a>
              );
            })}
          </p>
        </div>

        <div className="notice-bar__right">
          {ctaNorm ? (
            <a
              href={ctaNorm.href}
              className="notice-bar__cta"
              aria-label={ctaNorm.ariaLabel}
              target={ctaNorm.newTab ? "_blank" : undefined}
              rel={ctaNorm.external || ctaNorm.newTab ? "noopener noreferrer" : undefined}
              onClick={() => trackLink(ctaNorm.href, ctaNorm.text, "cta")}
            >
              {ctaNorm.text}
              <span className="notice-bar__ctaArrow" aria-hidden="true">
                →
              </span>
            </a>
          ) : null}

          <button type="button" className="notice-bar__dismiss" onClick={dismiss} aria-label="Dismiss notice">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
