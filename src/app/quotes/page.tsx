import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import QuotesClient from "@/components/QuotesClient";

const SITE =
  (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://adapnow.com")
    .toString()
    .trim()
    .replace(/\/+$/, "");

const BRAND = "ADAP";
const BRAND_LONG = "American Design And Printing";
const TAGLINE = "Custom Print Experts";

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function canonical(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE}${p}`;
}

function ogImageUrl(): string | undefined {
  // Prefer a dedicated social share env if you have it, else fall back to your logo ID if set.
  // If you later standardize variants (e.g. "socialShare"), swap the variant name here.
  const raw = safeStr(process.env.DEFAULT_SOCIAL_SHARE_IMAGE_ID || process.env.NEXT_PUBLIC_CF_LOGO_ID);
  if (!raw) return undefined;

  // If it's already a URL, use as-is.
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

  // Otherwise assume it's a Cloudflare Images ID and build a delivery URL using your account hash.
  const hash = safeStr(process.env.NEXT_PUBLIC_CF_ACCOUNT_HASH);
  if (!hash) return undefined;

  // Use a variant that exists in your account (you mentioned: productTile).
  // If you later add "socialShare", change to that.
  return `https://imagedelivery.net/${hash}/${raw}/productTile`;
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: `Custom Quotes & Orders | ${BRAND}`,
  description:
    "Request a fast, accurate print quote or submit a custom order. Trade-grade specs, artwork guidance, blind shipping options, and real support from ADAP.",
  alternates: {
    canonical: "/quotes",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  keywords: [
    "custom print quote",
    "trade printing quote",
    "business cards quote",
    "postcards quote",
    "banners quote",
    "large format quote",
    "labels and packaging quote",
    "blind shipping print",
    "rush print turnaround",
    "American Design And Printing",
    "ADAP print quote",
  ],
  openGraph: {
    title: `Custom Quotes & Orders | ${BRAND}`,
    description:
      "Tell us what you need — we’ll price it fast and align specs for production. Upload artwork, get a clean quote, and ship with confidence.",
    url: canonical("/quotes"),
    siteName: BRAND_LONG,
    type: "website",
    locale: "en_US",
    images: ogImageUrl()
      ? [
          {
            url: ogImageUrl()!,
            width: 1200,
            height: 630,
            alt: `${BRAND} — ${TAGLINE}`,
          },
        ]
      : undefined,
  },
  twitter: {
    card: "summary_large_image",
    title: `Custom Quotes & Orders | ${BRAND}`,
    description:
      "Fast, accurate print quotes. Trade-grade production specs. Real support. Built for pros.",
    images: ogImageUrl() ? [ogImageUrl()!] : undefined,
  },
};

const FAQ = [
  {
    q: "How fast do I get a quote?",
    a: "Most quotes are returned within 1–2 business days. If your deadline is tight, mention the hard deadline and destination so we can recommend turnaround + shipping options.",
  },
  {
    q: "What do you need to quote accurately?",
    a: "Product type, size, quantity, stock/material, finishing (e.g., matte/gloss/UV), and any special requirements like grommets, folds, or variable data. If you’re unsure, describe the end use and we’ll guide you.",
  },
  {
    q: "Do you support blind shipping?",
    a: "Yes — we can ship blind so your client sees neutral labeling. Tell us the destination and any special packing slip instructions in your request.",
  },
  {
    q: "Can I submit a custom order after a quote is approved?",
    a: "Yes — once you have an approved quote number, you can submit a custom order using the Custom Order tab. We’ll confirm details and next steps by email.",
  },
  {
    q: "What if my artwork isn’t print-ready?",
    a: "Use our Artwork Setup Guides for correct templates, bleed, and safe areas. If you need help, include notes and we’ll advise the cleanest path to production.",
  },
];

export default function QuotesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}#org`,
        name: BRAND_LONG,
        url: SITE,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}#website`,
        url: SITE,
        name: BRAND_LONG,
        publisher: { "@id": `${SITE}#org` },
      },
      {
        "@type": "Service",
        "@id": `${SITE}#service-quotes`,
        name: "Custom Print Quotes & Orders",
        provider: { "@id": `${SITE}#org` },
        areaServed: ["US", "CA"],
        serviceType: "Trade Printing Quotes, Custom Print Orders",
        url: canonical("/quotes"),
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE}#faq-quotes`,
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <main className="adap-page">
      <Script
        id="quotes-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="adap-container">
        {/* HERO */}
        <section className="adap-hero adap-hero--blue">
          <div className="adap-row">
            <div>
              <div className="adap-kicker">Fast, accurate pricing</div>
              <h1 className="adap-title">Custom Quotes & Orders</h1>
              <p className="adap-subtitle">
                Tell us what you need — we’ll align the spec, confirm production details, and price it fast.
                Built for professionals who want <b>clean output</b>, <b>reliable timing</b>, and <b>real support</b>.
              </p>

              <div className="adap-actions" style={{ display: "flex" as any }}>
                <Link href="#forms" className="adap-btn adap-btn--primary">
                  Start a Quote
                </Link>
                <Link href="/guides" className="adap-btn adap-btn--ghost">
                  Artwork Guides →
                </Link>
              </div>
            </div>

            <div className="adap-softbox" aria-label="What you get">
              <div className="adap-kicker">What you get</div>
              <ul className="adap-checklist" style={{ marginTop: 10 }}>
                <li className="adap-checklist__item">
                  <span className="adap-check" aria-hidden="true">✓</span>
                  <span><b>Spec matched</b> to production (size, stock, finishing, quantity)</span>
                </li>
                <li className="adap-checklist__item">
                  <span className="adap-check" aria-hidden="true">✓</span>
                  <span><b>Timeline clarity</b> (turnaround + shipping recommendations)</span>
                </li>
                <li className="adap-checklist__item">
                  <span className="adap-check" aria-hidden="true">✓</span>
                  <span><b>Pro workflows</b> (blind shipping, client-ready delivery)</span>
                </li>
              </ul>

              <div className="adap-actions" style={{ marginTop: 12 }}>
                <Link href="/shipping" className="adap-btn adap-btn--ghost">
                  Shipping Options →
                </Link>
                <Link href="/turnaround" className="adap-btn adap-btn--ghost">
                  Turnaround Options →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* TRUST STRIP */}
        <section className="adap-grid-3" style={{ marginTop: 18 }} aria-label="Why ADAP">
          {[
            {
              title: "Trade-grade output",
              desc: "Dialed-in specs and finishing guidance so results match expectations.",
            },
            {
              title: "Deadline-first advice",
              desc: "We’ll recommend the safest turnaround + shipping combo for your date.",
            },
            {
              title: "Client-ready fulfillment",
              desc: "Blind shipping, tracking, and packaging that protects finishes in transit.",
            },
          ].map((b) => (
            <article key={b.title} className="adap-card">
              <h2 className="adap-card__title">{b.title}</h2>
              <p className="adap-card__text">{b.desc}</p>
              <div className="adap-actions">
                <Link href="/support" className="adap-btn adap-btn--ghost">
                  Ask a question →
                </Link>
              </div>
            </article>
          ))}
        </section>

        {/* FORMS */}
        <section id="forms" className="adap-section adap-section--pad" style={{ marginTop: 18 }}>
          <div className="adap-row">
            <div>
              <div className="adap-kicker">Get started</div>
              <h2 className="adap-card__title" style={{ fontSize: 18 }}>
                Request a quote — or submit a custom order from an approved quote
              </h2>
              <p className="adap-card__text">
                This form experience works now. When your APIs are ready, we’ll wire submissions to your backend +
                Resend for fully automated handling.
              </p>
            </div>
            <div className="adap-actions">
              <Link href="/support/ticket" className="adap-btn adap-btn--dark">
                Create Support Ticket
              </Link>
            </div>
          </div>

          <div className="adap-card" style={{ marginTop: 14 }}>
            <QuotesClient />
          </div>
        </section>

        {/* FAQ */}
        <section className="adap-section adap-section--pad" style={{ marginTop: 18 }} aria-label="Quotes FAQ">
          <div className="adap-row">
            <div>
              <div className="adap-kicker">FAQ</div>
              <h2 className="adap-card__title" style={{ fontSize: 18 }}>
                Quick answers before you submit
              </h2>
              <p className="adap-card__text">
                Want the fastest quote? Include deadline, destination, and whether it’s blind shipped.
              </p>
            </div>
            <div className="adap-actions">
              <Link href="/guides" className="adap-btn adap-btn--ghost">
                Prep Guides →
              </Link>
              <Link href="/support" className="adap-btn adap-btn--primary">
                Talk to Support
              </Link>
            </div>
          </div>

          <div className="adap-grid-2" style={{ marginTop: 14 }}>
            {FAQ.map((f) => (
              <details key={f.q} className="adap-card">
                <summary className="adap-card__title" style={{ cursor: "pointer" as any }}>
                  {f.q}
                </summary>
                <p className="adap-card__text" style={{ marginTop: 10 }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="adap-section adap-section--pad" style={{ marginTop: 18 }}>
          <div className="adap-row">
            <div>
              <div className="adap-kicker">Prefer a guided approach?</div>
              <h2 className="adap-card__title" style={{ fontSize: 18 }}>
                Tell us what you’re trying to accomplish — we’ll recommend the best spec.
              </h2>
              <p className="adap-card__text">
                If you’re unsure about stock, coating, or finishing, we’ll help you avoid expensive mistakes.
              </p>
            </div>
            <div className="adap-actions">
              <Link href="/support" className="adap-btn adap-btn--dark">
                Chat with Support
              </Link>
              <Link href="#forms" className="adap-btn adap-btn--primary">
                Start a Quote
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
