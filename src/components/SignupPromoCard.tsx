"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useState, useCallback } from "react";
import { usePathname } from "next/navigation";

export type SignupPromoCardProps = {
  /**
   * Number of days before the promo can show again after dismiss.
   * Default: 14
   */
  dismissForDays?: number;

  /**
   * Where to send the user after sign-in/sign-up.
   * Default: /account/onboarding
   */
  onboardingPath?: string;

  /**
   * Optional: pages where we should never show this (prefix match).
   * Default blocks /account and /sign-in /sign-up.
   */
  disableOnPathPrefixes?: string[];

  /**
   * Do not show immediately:
   * - Wait this many ms since the user's first session visit.
   * Default: 20000 (20s)
   */
  minTimeOnSiteMs?: number;

  /**
   * Only show after user has seen at least this many pages in the same session.
   * Default: 2
   */
  minSessionPageViews?: number;

  /**
   * Only show after user scrolls at least this % down the page (0..1).
   * Default: 0.30 (30%)
   */
  minScrollRatio?: number;

  className?: string;
};

const DISMISS_KEY = "adap_signup_promo_dismissed_v3";
const SESSION_FIRST_SEEN_KEY = "adap_session_first_seen_ms_v1";
const SESSION_PAGEVIEWS_KEY = "adap_session_pageviews_v1";
const SESSION_SCROLLED_KEY = "adap_session_scrolled_v1";

function nowMs() {
  return Date.now();
}

function readNumberFromStorage(getter: (k: string) => string | null, key: string): number | null {
  try {
    const raw = getter(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeNumberToStorage(setter: (k: string, v: string) => void, key: string, value: number) {
  try {
    setter(key, String(value));
  } catch {
    // ignore
  }
}

function readStringFromStorage(getter: (k: string) => string | null, key: string): string | null {
  try {
    const raw = getter(key);
    return raw != null ? String(raw) : null;
  } catch {
    return null;
  }
}

function writeStringToStorage(setter: (k: string, v: string) => void, key: string, value: string) {
  try {
    setter(key, value);
  } catch {
    // ignore
  }
}

function readDismissUntil(): number | null {
  if (typeof window === "undefined") return null;
  return readNumberFromStorage(window.localStorage.getItem.bind(window.localStorage), DISMISS_KEY);
}

function writeDismissUntil(untilMs: number) {
  if (typeof window === "undefined") return;
  writeNumberToStorage(window.localStorage.setItem.bind(window.localStorage), DISMISS_KEY, untilMs);
}

function getSessionFirstSeenMs(): number | null {
  if (typeof window === "undefined") return null;
  return readNumberFromStorage(window.sessionStorage.getItem.bind(window.sessionStorage), SESSION_FIRST_SEEN_KEY);
}

function setSessionFirstSeenMs(ms: number) {
  if (typeof window === "undefined") return;
  writeNumberToStorage(window.sessionStorage.setItem.bind(window.sessionStorage), SESSION_FIRST_SEEN_KEY, ms);
}

function getSessionPageViews(): number {
  if (typeof window === "undefined") return 0;
  const n = readNumberFromStorage(window.sessionStorage.getItem.bind(window.sessionStorage), SESSION_PAGEVIEWS_KEY);
  return n != null ? Math.max(0, Math.floor(n)) : 0;
}

function setSessionPageViews(n: number) {
  if (typeof window === "undefined") return;
  writeNumberToStorage(window.sessionStorage.setItem.bind(window.sessionStorage), SESSION_PAGEVIEWS_KEY, n);
}

function getSessionScrolledFlag(): boolean {
  if (typeof window === "undefined") return false;
  const v = readStringFromStorage(window.sessionStorage.getItem.bind(window.sessionStorage), SESSION_SCROLLED_KEY);
  return v === "1";
}

function setSessionScrolledFlag() {
  if (typeof window === "undefined") return;
  writeStringToStorage(window.sessionStorage.setItem.bind(window.sessionStorage), SESSION_SCROLLED_KEY, "1");
}

function isPathBlocked(pathname: string, prefixes: string[]) {
  const p = pathname || "/";
  return prefixes.some((x) => x && p.startsWith(x));
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function currentScrollRatio(): number {
  // ratio = scrollY / (docHeight - viewportHeight)
  const doc = document.documentElement;
  const scrollTop = window.scrollY || doc.scrollTop || 0;
  const docHeight = Math.max(doc.scrollHeight, doc.offsetHeight, doc.clientHeight);
  const viewport = window.innerHeight || doc.clientHeight || 0;
  const denom = Math.max(1, docHeight - viewport);
  return scrollTop / denom;
}

export default function SignupPromoCard({
  dismissForDays = 14,
  onboardingPath = "/account/onboarding",
  disableOnPathPrefixes = ["/account", "/sign-in", "/sign-up"],
  minTimeOnSiteMs = 20_000,
  minSessionPageViews = 2,
  minScrollRatio = 0.30,
  className = "",
}: SignupPromoCardProps) {
  const { isSignedIn } = useAuth();
  const pathname = usePathname() || "/";

  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [scrolledEnough, setScrolledEnough] = useState(false);

  const redirectTo = useMemo(() => onboardingPath || "/account/onboarding", [onboardingPath]);

  const shouldBlockByPath = useMemo(
    () => isPathBlocked(pathname, disableOnPathPrefixes),
    [pathname, disableOnPathPrefixes]
  );

  const dismiss = useCallback(() => {
    const days = Math.max(0, Math.floor(dismissForDays || 0));
    const until = nowMs() + days * 24 * 60 * 60 * 1000;
    writeDismissUntil(until);
    setHidden(true);
  }, [dismissForDays]);

  // Escape to dismiss
  useEffect(() => {
    if (hidden) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden, dismiss]);

  // Track scroll intent (session-level)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const required = clamp01(minScrollRatio || 0);
    const already = getSessionScrolledFlag();
    if (already) {
      setScrolledEnough(true);
      return;
    }

    let raf = 0;

    const check = () => {
      raf = 0;
      // re-check in case page content changes
      const ratio = currentScrollRatio();
      if (ratio >= required) {
        setSessionScrolledFlag();
        setScrolledEnough(true);
      }
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(check);
    };

    // Initial check (if user lands deep via anchor/back)
    check();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll as any);
      window.removeEventListener("resize", onScroll as any);
    };
  }, [minScrollRatio]);

  // Decide show timing: after N ms AND after N page views AND after scroll intent
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;

    // session first seen
    const firstSeen = getSessionFirstSeenMs();
    const start = firstSeen ?? nowMs();
    if (firstSeen == null) setSessionFirstSeenMs(start);

    // increment session page views on navigation
    const prevViews = getSessionPageViews();
    const views = prevViews + 1;
    setSessionPageViews(views);

    const dismissedUntil = readDismissUntil();
    const dismissedActive = dismissedUntil != null && dismissedUntil > nowMs();

    // hard blockers
    if (isSignedIn || shouldBlockByPath || dismissedActive) {
      setHidden(true);
      return;
    }

    // Must have scroll intent
    if (!scrolledEnough) {
      setHidden(true);
      return;
    }

    // Must have enough page views
    const viewsOk = views >= Math.max(1, Math.floor(minSessionPageViews || 1));
    if (!viewsOk) {
      setHidden(true);
      return;
    }

    // Must have been on site long enough (since firstSeen)
    const elapsed = nowMs() - start;
    const remainingMs = Math.max(0, Math.floor((minTimeOnSiteMs || 0) - elapsed));

    const t = window.setTimeout(() => {
      const dismissedUntil2 = readDismissUntil();
      const dismissedActive2 = dismissedUntil2 != null && dismissedUntil2 > nowMs();
      if (isSignedIn || shouldBlockByPath || dismissedActive2) {
        setHidden(true);
        return;
      }

      // Re-validate scroll + views at show time
      const views2 = getSessionPageViews();
      const viewsOk2 = views2 >= Math.max(1, Math.floor(minSessionPageViews || 1));
      const scrolledOk2 = getSessionScrolledFlag();

      if (!viewsOk2 || !scrolledOk2) {
        setHidden(true);
        return;
      }

      setHidden(false);
    }, remainingMs);

    return () => window.clearTimeout(t);
  }, [pathname, isSignedIn, shouldBlockByPath, minTimeOnSiteMs, minSessionPageViews, scrolledEnough]);

  if (!mounted || isSignedIn || shouldBlockByPath || hidden) return null;

  return (
    <aside
      role="complementary"
      aria-label="Sign up promo"
      className={`signup-promo ${className}`.trim()}
      data-signup-promo
    >
      <div className="signup-promo__top">
        <div className="signup-promo__copy">
          <div className="signup-promo__eyebrow">Welcome</div>
          <h3 className="signup-promo__title">Create a free ADAP account</h3>
          <p className="signup-promo__desc">
            Save quotes, track orders, and upload artwork faster on reorders.
          </p>
        </div>

        <button type="button" className="signup-promo__close" onClick={dismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>

      <div className="signup-promo__actions">
        <SignInButton
          mode="modal"
          withSignUp
          forceRedirectUrl={redirectTo}
          fallbackRedirectUrl={redirectTo}
          signUpForceRedirectUrl={redirectTo}
          signUpFallbackRedirectUrl={redirectTo}
        >
          <button className="btn btn-primary signup-promo__cta" type="button">
            Sign in / Create account
          </button>
        </SignInButton>

        <button className="signup-promo__later" type="button" onClick={dismiss}>
          Not now
        </button>
      </div>

      <div className="signup-promo__fineprint">
        Tip: Press <kbd className="signup-promo__kbd">Esc</kbd> to close.
      </div>
    </aside>
  );
}
