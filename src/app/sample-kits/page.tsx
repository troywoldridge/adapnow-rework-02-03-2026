import { AdapHero } from "@/components/adap/PageSections";

const KIT_FEATURES = [
  "Paper and stock examples",
  "Print finish comparisons",
  "Size and fold references",
];

export default function SampleKitsPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        <AdapHero
          kicker="Samples"
          title="Sample kits"
          subtitle="Preview materials and print quality before placing larger production runs."
          actions={[{ href: "/quotes", label: "Request pricing", className: "adap-btn adap-btn--primary" }]}
        />

        <section className="adap-card" style={{ marginTop: 18 }}>
          <h2 className="adap-card__title">What’s included</h2>
          <ul className="adap-checklist" style={{ marginTop: 12 }}>
            {KIT_FEATURES.map((feature) => (
              <li key={feature} className="adap-checklist__item">
                <span className="adap-check" aria-hidden>✓</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
