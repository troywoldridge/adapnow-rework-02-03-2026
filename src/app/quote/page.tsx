import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Request a Quote | ADAP",
  description:
    "Get a tailored print quote with accurate pricing, lead-time guidance, and production recommendations from ADAP.",
  alternates: { canonical: "/quote" },
};

export default function QuotePage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero adap-hero--emerald">
          <div className="adap-kicker">Custom pricing</div>
          <h1 className="adap-title">Request a Quote</h1>
          <p className="adap-subtitle">
            Share specs once and receive clear, production-ready recommendations for paper, finish, quantity, and
            timeline.
          </p>
        </section>

        <section className="adap-grid-2" style={{ marginTop: 18 }}>
          <article className="adap-card">
            <h2 className="adap-card__title">What to include</h2>
            <ul className="adap-checklist" style={{ marginTop: 12 }}>
              <li className="adap-checklist__item"><span className="adap-check">✓</span><span>Product type and target quantity</span></li>
              <li className="adap-checklist__item"><span className="adap-check">✓</span><span>Size, stock, coating, and finishing needs</span></li>
              <li className="adap-checklist__item"><span className="adap-check">✓</span><span>Delivery city, deadline, and special instructions</span></li>
            </ul>
          </article>

          <article className="adap-card">
            <h2 className="adap-card__title">Start quote workflow</h2>
            <p className="adap-card__text">Use our full quote intake for file review and exact costing.</p>
            <div className="adap-actions">
              <Link href="/quotes" className="adap-btn adap-btn--primary">Open Quote Form</Link>
              <Link href="/support/chat" className="adap-btn adap-btn--ghost">Chat with Specialist</Link>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
