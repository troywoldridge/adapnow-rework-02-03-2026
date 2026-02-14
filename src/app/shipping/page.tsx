import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Shipping Options | ADAP",
  description:
    "Fast, reliable shipping with tracking. Blind ship options, smart packaging, and delivery choices that fit your timeline.",
};

type CarrierCard = {
  name: string;
  desc: string;
  bullets: Array<{ label: string; detail: string }>;
};

const CARRIERS: CarrierCard[] = [
  {
    name: "UPS",
    desc: "Reliable coverage and strong delivery consistency across the U.S.",
    bullets: [
      { label: "Standard", detail: "Cost-effective for most orders; varies by distance." },
      { label: "2-Day / Expedited", detail: "Great for deadlines; faster delivery targets." },
      { label: "Express Saver", detail: "Fastest options for urgent timelines (where available)." },
    ],
  },
  {
    name: "FedEx",
    desc: "Excellent nationwide network with multiple speed tiers.",
    bullets: [
      { label: "Ground", detail: "Solid everyday option for typical shipping windows." },
      { label: "Economy (2-Day)", detail: "Balanced speed + cost for time-sensitive deliveries." },
      { label: "Priority", detail: "Fastest tiers for urgent jobs (where available)." },
    ],
  },
];

const PERKS = [
  {
    title: "Blind Shipping",
    desc: "Ship directly to your client with neutral labeling. Your brand stays front and center.",
  },
  {
    title: "Live Tracking",
    desc: "Tracking links are available once the carrier scan begins — easy to share with customers.",
  },
  {
    title: "Smart Packaging",
    desc: "We package to protect corners, finishes, and surface quality so prints arrive client-ready.",
  },
];

export default function ShippingPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        {/* HERO */}
        <section className="adap-hero adap-hero--blue">
          <div className="adap-row">
            <div>
              <div className="adap-kicker">Delivery & tracking</div>
              <h1 className="adap-title">Shipping Options</h1>
              <p className="adap-subtitle">
                Shipping time is <b>separate</b> from production time. The best way to hit deadlines is to choose the
                right turnaround speed + shipping method together. If you’re shipping to a client,{" "}
                <b>blind shipping</b> keeps labels and packing slips neutral.
              </p>
            </div>

            <div className="adap-actions">
              <Link href="/turnaround" className="adap-btn adap-btn--ghost">
                Turnaround Options →
              </Link>
              <Link href="/support" className="adap-btn adap-btn--primary">
                Get Shipping Help
              </Link>
            </div>
          </div>

          <div className="adap-softbox" style={{ marginTop: 14 }}>
            <ul className="adap-checklist" aria-label="Shipping notes">
              <li className="adap-checklist__item">
                <span className="adap-check" aria-hidden="true">✓</span>
                <span>
                  <b>Tracking appears after pickup:</b> once the carrier scans the shipment, tracking becomes active.
                </span>
              </li>
              <li className="adap-checklist__item">
                <span className="adap-check" aria-hidden="true">✓</span>
                <span>
                  <b>PO Boxes:</b> some shipping tiers may not deliver to PO boxes — ask support if unsure.
                </span>
              </li>
              <li className="adap-checklist__item">
                <span className="adap-check" aria-hidden="true">✓</span>
                <span>
                  <b>International:</b> availability depends on product type and destination.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* PERKS */}
        <section className="adap-grid-3" style={{ marginTop: 18 }} aria-label="Shipping perks">
          {PERKS.map((p) => (
            <article key={p.title} className="adap-card">
              <h2 className="adap-card__title">{p.title}</h2>
              <p className="adap-card__text">{p.desc}</p>
              <div className="adap-actions">
                <Link href="/support" className="adap-btn adap-btn--ghost">
                  Ask about this →
                </Link>
              </div>
            </article>
          ))}
        </section>

        {/* CARRIERS */}
        <section className="adap-grid-2" style={{ marginTop: 18 }} aria-label="Carriers">
          {CARRIERS.map((c) => (
            <article key={c.name} className="adap-card">
              <div className="adap-row">
                <div>
                  <h2 className="adap-card__title">{c.name}</h2>
                  <p className="adap-card__text">{c.desc}</p>
                </div>
                <span className="adap-badge">Trusted carrier</span>
              </div>

              <div className="adap-softbox" style={{ marginTop: 12 }}>
                <div className="adap-kicker">Typical options</div>
                <ul className="adap-checklist" style={{ marginTop: 10 }}>
                  {c.bullets.map((b) => (
                    <li key={b.label} className="adap-checklist__item">
                      <span className="adap-check" aria-hidden="true">✓</span>
                      <span>
                        <b>{b.label}:</b> {b.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="adap-actions">
                <Link href="/turnaround" className="adap-btn adap-btn--ghost">
                  Pair with turnaround →
                </Link>
                <Link href="/support" className="adap-btn adap-btn--primary">
                  Recommend best option
                </Link>
              </div>
            </article>
          ))}
        </section>

        {/* FINAL CTA */}
        <section className="adap-section adap-section--pad" style={{ marginTop: 18 }}>
          <div className="adap-row">
            <div>
              <div className="adap-kicker">Fast answers</div>
              <h2 className="adap-card__title" style={{ fontSize: 18 }}>
                Tell us destination + deadline. We’ll tell you the safest combo.
              </h2>
              <p className="adap-card__text">
                We’ll factor production, shipping, and common gotchas so you’re covered.
              </p>
            </div>
            <div className="adap-actions">
              <Link href="/support" className="adap-btn adap-btn--dark">
                Contact Support
              </Link>
              <Link href="/quotes" className="adap-btn adap-btn--primary">
                Request a Quote
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
