import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Our Guarantees | ADAP",
  description:
    "Print with confidence. Clear expectations on quality, packaging, accuracy, and support if something goes wrong.",
};

const GUARANTEES = [
  {
    title: "Print-Ready Review",
    desc:
      "We follow proven prepress expectations. If a file is likely to produce poor results, we’ll flag it early whenever possible.",
  },
  {
    title: "Quality & Consistency",
    desc:
      "We aim for crisp output, accurate trimming, and consistent results across reorders. Color can vary by material and finishing — we’ll advise best practices.",
  },
  {
    title: "Safe Packaging",
    desc:
      "We package to protect corners and finishes. If something arrives damaged in transit, we’ll help you resolve it fast.",
  },
  {
    title: "Accurate Orders",
    desc:
      "We confirm core details (product, size, quantity, shipping) so what you approved is what you receive.",
  },
];

const WHAT_WE_NEED = [
  "Order number and a clear description of the issue",
  "Photos of the product and packaging (for damage claims)",
  "If color-related: note stock/coating and provide reference expectations",
  "Your deadline (we’ll recommend fastest resolution paths)",
];

export default function GuaranteesPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        {/* HERO */}
        <section className="adap-hero">
          <div className="adap-row">
            <div>
              <div className="adap-kicker">Confidence & support</div>
              <h1 className="adap-title">Our Guarantees</h1>
              <p className="adap-subtitle">
                We build ADAP for professionals who can’t afford surprises. Here’s what we stand behind,
                what to expect, and how we resolve issues quickly if something isn’t right.
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
            <ul className="adap-checklist" aria-label="Guarantee summary">
              <li className="adap-checklist__item">
                <span className="adap-check" aria-hidden="true">✓</span>
                <span>
                  <b>Fast resolution:</b> we prioritize issues that affect delivery deadlines.
                </span>
              </li>
              <li className="adap-checklist__item">
                <span className="adap-check" aria-hidden="true">✓</span>
                <span>
                  <b>Clear communication:</b> you’ll always know the next step and what we need from you.
                </span>
              </li>
              <li className="adap-checklist__item">
                <span className="adap-check" aria-hidden="true">✓</span>
                <span>
                  <b>Professional standards:</b> best practices for prepress, packaging, and fulfillment.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* GUARANTEE CARDS */}
        <section className="adap-grid-2" style={{ marginTop: 18 }} aria-label="Guarantees">
          {GUARANTEES.map((g) => (
            <article key={g.title} className="adap-card">
              <h2 className="adap-card__title">{g.title}</h2>
              <p className="adap-card__text">{g.desc}</p>
              <div className="adap-actions">
                <Link href="/support" className="adap-btn adap-btn--ghost">
                  Get help →
                </Link>
              </div>
            </article>
          ))}
        </section>

        {/* RESOLUTION PROCESS */}
        <section className="adap-section adap-section--pad" style={{ marginTop: 18 }}>
          <div className="adap-row">
            <div>
              <div className="adap-kicker">If something goes wrong</div>
              <h2 className="adap-card__title" style={{ fontSize: 18 }}>
                The fastest way to resolve an issue
              </h2>
              <p className="adap-card__text">
                Use the support flow below — we’ll route it to the right person immediately.
              </p>
            </div>
            <div className="adap-actions">
              <Link href="/support/ticket" className="adap-btn adap-btn--primary">
                Create a Support Ticket
              </Link>
              <Link href="/support" className="adap-btn adap-btn--ghost">
                Support Center →
              </Link>
            </div>
          </div>

          <div className="adap-grid-2" style={{ marginTop: 14 }}>
            <div className="adap-softbox">
              <div className="adap-kicker">What we’ll ask for</div>
              <ul className="adap-checklist" style={{ marginTop: 10 }}>
                {WHAT_WE_NEED.map((t) => (
                  <li key={t} className="adap-checklist__item">
                    <span className="adap-check" aria-hidden="true">✓</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="adap-softbox">
              <div className="adap-kicker">Best practices (prevents issues)</div>
              <ul className="adap-checklist" style={{ marginTop: 10 }}>
                <li className="adap-checklist__item">
                  <span className="adap-check" aria-hidden="true">✓</span>
                  <span>
                    Use the correct templates and bleed settings from{" "}
                    <Link href="/guides" className="underline underline-offset-4">
                      Artwork Setup Guides
                    </Link>
                    .
                  </span>
                </li>
                <li className="adap-checklist__item">
                  <span className="adap-check" aria-hidden="true">✓</span>
                  <span>Use high-resolution assets and embed fonts when possible.</span>
                </li>
                <li className="adap-checklist__item">
                  <span className="adap-check" aria-hidden="true">✓</span>
                  <span>For color-critical work, ask support for best material/finish guidance.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="adap-section adap-section--pad" style={{ marginTop: 18 }}>
          <div className="adap-row">
            <div>
              <div className="adap-kicker">Ready to start?</div>
              <h2 className="adap-card__title" style={{ fontSize: 18 }}>
                Get a quote in minutes — we’ll handle the details.
              </h2>
              <p className="adap-card__text">
                If you’re not sure what spec you need, tell us the goal and we’ll recommend the best setup.
              </p>
            </div>

            <div className="adap-actions">
              <Link href="/quotes" className="adap-btn adap-btn--primary">
                Request a Quote
              </Link>
              <Link href="/categories" className="adap-btn adap-btn--ghost">
                Browse Categories →
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
