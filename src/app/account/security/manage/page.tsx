import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Manage Security | ADAP Account",
  description:
    "Control your password, sign-in hygiene, and account safety settings from one secure ADAP security center.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/account/security/manage" },
};

const SECURITY_BLOCKS = [
  {
    title: "Password policy",
    detail: "Use a unique passphrase with at least 12 characters and rotate it regularly.",
  },
  {
    title: "Session awareness",
    detail: "Review active sessions and sign out unknown devices immediately.",
  },
  {
    title: "Support verification",
    detail: "ADAP support will never ask for full password or card details over chat/email.",
  },
];

export default function AccountSecurityManagePage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero adap-hero--emerald">
          <div className="adap-kicker">Security center</div>
          <h1 className="adap-title">Manage Account Security</h1>
          <p className="adap-subtitle">
            Keep your ADAP account protected with best-practice credentials, session controls, and immediate support
            escalation if you notice suspicious activity.
          </p>
          <div className="adap-actions">
            <Link href="/account" className="adap-btn adap-btn--ghost">
              Back to Account
            </Link>
            <Link href="/support/chat" className="adap-btn adap-btn--primary">
              Contact Security Support
            </Link>
          </div>
        </section>

        <section className="adap-grid-3" style={{ marginTop: 18 }} aria-label="Security recommendations">
          {SECURITY_BLOCKS.map((block) => (
            <article key={block.title} className="adap-card">
              <h2 className="adap-card__title">{block.title}</h2>
              <p className="adap-card__text">{block.detail}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
