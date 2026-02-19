import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sample Kits | ADAP",
  description:
    "Order ADAP sample kits to evaluate print quality, paper stocks, coatings, and finishing details before production runs.",
  alternates: { canonical: "/sample-kits" },
};

const KIT_FEATURES = [
  "Curated examples of top-selling products",
  "Paper, coating, and finish comparisons",
  "Packaging references for client presentations",
];

export default function SampleKitsPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero adap-hero--emerald">
          <div className="adap-kicker">Pre-production confidence</div>
          <h1 className="adap-title">Sample Kits</h1>
          <p className="adap-subtitle">
            Review tactile quality and finishing details before launch so your clients approve with confidence.
          </p>
        </section>

        <section className="adap-card" style={{ marginTop: 18 }}>
          <h2 className="adap-card__title">What’s included</h2>
          <ul className="adap-checklist" style={{ marginTop: 12 }}>
            {KIT_FEATURES.map((feature) => (
              <li key={feature} className="adap-checklist__item">
                <span className="adap-check">✓</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <div className="adap-actions">
            <Link href="/contact/form" className="adap-btn adap-btn--primary">Request a Sample Kit</Link>
            <Link href="/products" className="adap-btn adap-btn--ghost">Browse Products</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
