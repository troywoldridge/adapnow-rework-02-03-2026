import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Products | ADAP",
  description:
    "Explore premium print products with fast turnarounds, consistent quality, and wholesale-friendly pricing.",
  alternates: { canonical: "/products" },
};

const COLLECTIONS = [
  { title: "Business essentials", desc: "Cards, stationery, envelopes, and daily brand touchpoints.", href: "/categories" },
  { title: "Marketing prints", desc: "Flyers, brochures, postcards, and conversion-focused campaign pieces.", href: "/categories" },
  { title: "Display & large format", desc: "Banners, signage, and event graphics that stand out in person.", href: "/categories" },
];

export default function ProductsPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <section className="adap-hero adap-hero--blue">
          <div className="adap-kicker">Catalog</div>
          <h1 className="adap-title">Premium Print Products</h1>
          <p className="adap-subtitle">
            Built for agencies, enterprises, and local businesses that need repeatable quality and dependable timelines.
          </p>
          <div className="adap-actions">
            <Link href="/categories" className="adap-btn adap-btn--primary">
              Browse Categories
            </Link>
            <Link href="/quote" className="adap-btn adap-btn--ghost">
              Request Pricing
            </Link>
          </div>
        </section>

        <section className="adap-grid-3" style={{ marginTop: 18 }}>
          {COLLECTIONS.map((item) => (
            <article className="adap-card" key={item.title}>
              <h2 className="adap-card__title">{item.title}</h2>
              <p className="adap-card__text">{item.desc}</p>
              <div className="adap-actions">
                <Link href={item.href} className="adap-btn adap-btn--ghost">
                  Explore →
                </Link>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
