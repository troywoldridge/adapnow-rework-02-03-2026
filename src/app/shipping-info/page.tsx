import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Shipping Information | ADAP",
  description:
    "Review shipping windows, delivery methods, and best practices for meeting print production deadlines.",
  alternates: { canonical: "/shipping-info" },
};

export default function ShippingInfoPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero adap-hero--blue">
          <div className="adap-kicker">Logistics</div>
          <h1 className="adap-title">Shipping Information</h1>
          <p className="adap-subtitle">
            Delivery speed, production cadence, and carrier selection all impact final arrival dates—plan all three
            together for reliable outcomes.
          </p>
          <div className="adap-actions">
            <Link href="/shipping" className="adap-btn adap-btn--primary">View Shipping Options</Link>
            <Link href="/support/chat" className="adap-btn adap-btn--ghost">Ask a Shipping Specialist</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
