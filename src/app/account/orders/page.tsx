import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Order History | ADAP Account",
  description:
    "Review your order history, reorder in seconds, and keep every shipment and invoice in one secure account view.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/account/orders" },
};

const ORDER_TIPS = [
  "Filter by date range or status to find jobs fast.",
  "Reorder in one click from completed jobs.",
  "Open invoice PDFs and shipment tracking from each order.",
];

export default function AccountOrdersPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero adap-hero--blue">
          <div className="adap-kicker">Account workspace</div>
          <h1 className="adap-title">Order History</h1>
          <p className="adap-subtitle">
            Centralize every placed order, reorder repeat jobs quickly, and track delivery details without leaving your
            account.
          </p>
          <div className="adap-actions">
            <Link className="adap-btn adap-btn--primary" href="/account">
              Back to Dashboard
            </Link>
            <Link className="adap-btn adap-btn--ghost" href="/support/ticket">
              Need Order Help
            </Link>
          </div>
        </section>

        <section className="adap-grid-2" style={{ marginTop: 18 }}>
          <article className="adap-card">
            <h2 className="adap-card__title">What you can do here</h2>
            <ul className="adap-checklist" style={{ marginTop: 12 }}>
              {ORDER_TIPS.map((tip) => (
                <li className="adap-checklist__item" key={tip}>
                  <span className="adap-check" aria-hidden>
                    ✓
                  </span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="adap-card">
            <h2 className="adap-card__title">Quick links</h2>
            <p className="adap-card__text">Jump directly into common account workflows.</p>
            <div className="adap-actions">
              <Link className="adap-btn adap-btn--ghost" href="/account">
                Open Orders Dashboard
              </Link>
              <Link className="adap-btn adap-btn--ghost" href="/account/security/manage">
                Security Settings
              </Link>
              <Link className="adap-btn adap-btn--dark" href="/products">
                Start New Order
              </Link>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
