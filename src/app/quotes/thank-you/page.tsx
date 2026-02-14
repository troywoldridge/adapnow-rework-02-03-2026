import type { Metadata } from "next";
import Link from "next/link";

const BRAND = "ADAP";

export const metadata: Metadata = {
  title: `Request received | ${BRAND}`,
  description: "We received your request and will follow up shortly.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/quotes/thank-you" },
};

export default function QuotesThankYouPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero adap-hero--emerald">
          <div className="adap-row">
            <div>
              <div className="adap-kicker">You’re all set</div>
              <h1 className="adap-title">Request received</h1>
              <p className="adap-subtitle">
                We’ll review your details and respond by email. If your deadline is tight, contact support so we can
                prioritize the fastest safe path.
              </p>
            </div>
            <div className="adap-actions">
              <Link href="/support" className="adap-btn adap-btn--primary">
                Contact Support
              </Link>
              <Link href="/guides" className="adap-btn adap-btn--ghost">
                Artwork Guides →
              </Link>
            </div>
          </div>

          <div className="adap-softbox" style={{ marginTop: 14 }}>
            <ul className="adap-checklist" aria-label="Next steps">
              <li className="adap-checklist__item">
                <span className="adap-check" aria-hidden="true">✓</span>
                <span>Watch your inbox for a confirmation and follow-up questions.</span>
              </li>
              <li className="adap-checklist__item">
                <span className="adap-check" aria-hidden="true">✓</span>
                <span>If you have a hard deadline, message support with date + destination.</span>
              </li>
              <li className="adap-checklist__item">
                <span className="adap-check" aria-hidden="true">✓</span>
                <span>Want to browse while you wait? Check categories and sample kits.</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="adap-section adap-section--pad" style={{ marginTop: 18 }}>
          <div className="adap-row">
            <div>
              <div className="adap-kicker">Explore</div>
              <h2 className="adap-card__title" style={{ fontSize: 18 }}>
                While we work on your quote…
              </h2>
              <p className="adap-card__text">
                Browse popular categories, sample kits, or check shipping and turnaround options.
              </p>
            </div>
            <div className="adap-actions">
              <Link href="/categories" className="adap-btn adap-btn--dark">
                Browse Categories
              </Link>
              <Link href="/sample-kits" className="adap-btn adap-btn--ghost">
                Sample Kits →
              </Link>
            </div>
          </div>

          <div className="adap-grid-3" style={{ marginTop: 14 }}>
            <div className="adap-card">
              <h3 className="adap-card__title">Turnaround</h3>
              <p className="adap-card__text">Pick the right speed for your deadline.</p>
              <div className="adap-actions">
                <Link href="/turnaround" className="adap-btn adap-btn--ghost">View options →</Link>
              </div>
            </div>
            <div className="adap-card">
              <h3 className="adap-card__title">Shipping</h3>
              <p className="adap-card__text">Blind ship, tracking, and smart packaging.</p>
              <div className="adap-actions">
                <Link href="/shipping" className="adap-btn adap-btn--ghost">Learn more →</Link>
              </div>
            </div>
            <div className="adap-card">
              <h3 className="adap-card__title">Prep Guides</h3>
              <p className="adap-card__text">Templates and setup tips to avoid delays.</p>
              <div className="adap-actions">
                <Link href="/guides" className="adap-btn adap-btn--ghost">Download PDFs →</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
