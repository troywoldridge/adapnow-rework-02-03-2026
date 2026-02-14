"use client";

import Link from "next/link";

export type SupportBannerProps = {
  className?: string;

  /**
   * Display phone label text (what the user sees).
   * Default matches your current UI text.
   */
  phoneLabel?: string;

  /**
   * Phone number to dial (digits, +, -, spaces ok).
   * Default: 1-866-899-2499
   */
  phoneDial?: string;
};

function toTelHref(phoneDial: string) {
  const raw = String(phoneDial ?? "").trim();
  if (!raw) return "tel:1-866-899-2499";
  const safe = raw.replace(/[^0-9+]/g, "");
  return safe ? `tel:${safe}` : "tel:1-866-899-2499";
}

export default function SupportBanner({
  className = "",
  phoneLabel = "+1 606-541-0989",
  phoneDial = "1-866-899-2499",
}: SupportBannerProps) {
  const telHref = toTelHref(phoneDial);

  return (
    <div className={`support-banner ${className}`.trim()} role="region" aria-label="Support links">
      <div className="support-banner__inner">
        <nav className="support-banner__nav" aria-label="Support navigation">
          <Link className="support-banner__link" href="/support/ticket">
            <span className="support-banner__icon" role="img" aria-label="ticket">
              ✉️
            </span>
            <span>Create a Support Ticket</span>
          </Link>

          {/* Use <a> for tel: links (not Next <Link>) */}
          <a className="support-banner__link" href={telHref}>
            <span className="support-banner__icon" role="img" aria-label="phone">
              📞
            </span>
            <span>{phoneLabel}</span>
          </a>

          <Link className="support-banner__link" href="/support/chat">
            <span className="support-banner__icon" role="img" aria-label="chat">
              💬
            </span>
            <span>Chat with an Agent</span>
          </Link>

          <Link className="support-banner__link" href="/support">
            <span className="support-banner__icon" role="img" aria-label="help">
              ❓
            </span>
            <span>Support Center</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}
