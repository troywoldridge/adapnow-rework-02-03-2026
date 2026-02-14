import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Turnaround Options | ADAP",
  description:
    "Choose the right production speed for your deadline. Clear cutoffs, realistic timelines, and tips to avoid delays.",
};

type Window = {
  label: string;
  badge: string;
  details: string;
  cutoff: string;
  idealFor: string;
};

const WINDOWS: Window[] = [
  {
    label: "Next Business Day",
    badge: "Fastest",
    cutoff: "Cut-off: 1:00 PM EST",
    details:
      "For simple jobs with press-ready files. Limited availability based on capacity and product type.",
    idealFor: "Rush events, last-minute client approvals, emergency reprints.",
  },
  {
    label: "2–3 Business Days",
    badge: "Popular",
    cutoff: "Cut-off: 1:00 PM EST",
    details:
      "A strong balance of speed + cost. Great for repeat items and high-volume staples.",
    idealFor: "Most business essentials, promos, time-sensitive mailers.",
  },
  {
    label: "3–4 Business Days",
    badge: "Standard",
    cutoff: "Cut-off: 1:00 PM EST",
    details:
      "The default choice for many products. Best when you want predictable timing.",
    idealFor: "General print runs, standard marketing materials, reorders.",
  },
  {
    label: "5–7 Business Days",
    badge: "Value",
    cutoff: "Cut-off: 1:00 PM EST",
    details:
      "Best pricing windows and ideal for larger planning horizons.",
    idealFor: "Bulk runs, evergreen collateral, planned campaigns.",
  },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function TurnaroundPage() {
  return (
    <main className="adap-page">
      <div className="adap-container">
        {/* HERO */}
        <section className="adap-hero adap-hero--emerald">
          <div className="adap-row">
            <div>
              <div className="adap-kicker">Production timing</div>
              <h1 className="adap-title">Turnaround Options</h1>
              <p className="adap-subtitle">
                Turnaround is the <b>production window</b> (not shipping time). It starts after{" "}
                <b>payment</b> and after your artwork is <b>press-ready</b> (and proof approval, if required).
                To avoid delays, use our{" "}
                <Link href="/guides" className="underline underline-offset-4">
                  Artwork Setup Guides
                </Link>
                .
              </p>
            </div>

            <div className="adap-actions">
              <Link href="/quotes" className="adap-btn adap-btn--primary">
                Request a Quote
              </Link>
              <Link href="/support" className="adap-btn adap-btn--ghost">
                Ask an Expert
              </Link>
            </div>
          </div>

          <div className="adap-softbox" style={{ marginTop: 14 }}>
            <ul className="adap-checklist" aria-label="Turnaround tips">
              <li className="adap-checklist__item">
                <span className="adap-check" aria-hidden="true">✓</span>
                <span>
                  <b>Cut-off time matters:</b> orders placed after cut-off move to the next business day.
                </span>
              </li>
              <li className="adap-checklist__item">
                <span className="adap-check" aria-hidden="true">✓</span>
                <span>
                  <b>Weekends/holidays:</b> production days exclude weekends and major holidays.
                </span>
              </li>
              <li className="adap-checklist__item">
                <span className="adap-check" aria-hidden="true">✓</span>
                <span>
                  <b>Shipping is separate:</b> shipping time is added on top of production time.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* GRID */}
        <section className="adap-grid-2" style={{ marginTop: 18 }} aria-label="Turnaround windows">
          {WINDOWS.map((w) => (
            <article key={w.label} className="adap-card">
              <div className="adap-row">
                <div>
                  <h2 className="adap-card__title">{w.label}</h2>
                  <div className="adap-card__text" style={{ marginTop: 6 }}>
                    <span className="adap-badge">{w.badge}</span>
                    <span style={{ marginLeft: 10, color: "#64748b", fontSize: 12, fontWeight: 800 }}>
                      {w.cutoff}
                    </span>
                  </div>
                </div>
              </div>

              <p className="adap-card__text">{w.details}</p>

              <div className="adap-softbox" style={{ marginTop: 12 }}>
                <div className="adap-kicker">Ideal for</div>
                <div style={{ marginTop: 6, color: "#334155", fontSize: 14, lineHeight: 1.5 }}>
                  {w.idealFor}
                </div>
              </div>

              <div className="adap-pills" aria-label="Business week">
                {DAYS.map((d) => (
                  <div
                    key={d}
                    className={`adap-pill${d === "Sat" || d === "Sun" ? " adap-pill--weekend" : ""}`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="adap-actions">
                <Link href="/shipping" className="adap-btn adap-btn--ghost">
                  Shipping Options →
                </Link>
                <Link href="/guides" className="adap-btn adap-btn--ghost">
                  Prep Guides →
                </Link>
              </div>
            </article>
          ))}
        </section>

        {/* FINAL CTA */}
        <section className="adap-section adap-section--pad" style={{ marginTop: 18 }}>
          <div className="adap-row">
            <div>
              <div className="adap-kicker">Need help picking speed?</div>
              <h2 className="adap-card__title" style={{ fontSize: 18 }}>
                Tell us your event date and destination — we’ll recommend the safest option.
              </h2>
              <p className="adap-card__text">
                We’ll account for production + shipping so you don’t get surprised at checkout.
              </p>
            </div>
            <div className="adap-actions">
              <Link href="/support" className="adap-btn adap-btn--dark">
                Chat with Support
              </Link>
              <Link href="/quotes" className="adap-btn adap-btn--primary">
                Get a Quote
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
