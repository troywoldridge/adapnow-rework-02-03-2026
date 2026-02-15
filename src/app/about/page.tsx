import type { Metadata } from "next";

const SITE_NAME = "American Design And Printing";
const BRAND = "ADAP";
const CANONICAL_PATH = "/about";

export const metadata: Metadata = {
  title: `About Us | ${SITE_NAME}`,
  description:
    `Learn about ${SITE_NAME} (${BRAND})—our mission, values, and commitment to high-quality print, packaging, and promotional products for businesses of every size.`,
  alternates: {
    canonical: CANONICAL_PATH,
  },
  openGraph: {
    type: "website",
    url: CANONICAL_PATH,
    title: `About Us | ${SITE_NAME}`,
    description:
      `Learn about ${SITE_NAME} (${BRAND})—our mission, values, and commitment to high-quality print, packaging, and promotional products.`,
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `About Us | ${SITE_NAME}`,
    description:
      `Learn about ${SITE_NAME} (${BRAND})—our mission, values, and commitment to high-quality print, packaging, and promotional products.`,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  // Keep keywords reasonable. For About pages this is optional; included lightly.
  keywords: [
    "American Design And Printing",
    "ADAP",
    "print services",
    "custom printing",
    "packaging",
    "promotional products",
    "wholesale print",
  ],
};

function orgJsonLd() {
  // NOTE: If you have real values, swap these env vars in your deployment.
  // Keeping it safe + optional so it doesn't break builds.
  const url =
    (process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL.trim()) || "";
  const supportEmail =
    (process.env.NEXT_PUBLIC_SUPPORT_EMAIL && process.env.NEXT_PUBLIC_SUPPORT_EMAIL.trim()) || "";
  const supportPhone =
    (process.env.NEXT_PUBLIC_SUPPORT_PHONE && process.env.NEXT_PUBLIC_SUPPORT_PHONE.trim()) || "";

  const sameAsRaw =
    (process.env.NEXT_PUBLIC_ORG_SAME_AS && process.env.NEXT_PUBLIC_ORG_SAME_AS.trim()) || "";
  const sameAs = sameAsRaw
    ? sameAsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const contactPoint =
    supportEmail || supportPhone
      ? [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: supportEmail || undefined,
            telephone: supportPhone || undefined,
            availableLanguage: ["English"],
          },
        ]
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: BRAND,
    url: url || undefined,
    description:
      "High-quality print, packaging, and promotional products with dependable turnaround, fair pricing, and hands-on support.",
    contactPoint,
    sameAs,
  };
}

function aboutPageJsonLd() {
  const url =
    (process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL.trim()) || "";
  const fullUrl = url ? `${url.replace(/\/+$/, "")}${CANONICAL_PATH}` : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: `About ${SITE_NAME}`,
    description:
      `Learn about ${SITE_NAME} (${BRAND})—our story, mission, and how we help brands stand out with print, packaging, and promotional products.`,
    url: fullUrl,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: url || undefined,
    },
    about: {
      "@type": "Organization",
      name: SITE_NAME,
      alternateName: BRAND,
    },
  };
}

export default function AboutPage() {
  return (
    <main className="container mx-auto px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageJsonLd()) }}
      />

      <article className="prose max-w-none">
        <header>
          <h1>About {SITE_NAME}</h1>
          <p>
            At <strong>{SITE_NAME} ({BRAND})</strong>, we help businesses stand out with
            premium <strong>print</strong>, <strong>packaging</strong>, and <strong>promotional products</strong>—delivered
            with speed, consistency, and real support.
          </p>
        </header>

        <section aria-labelledby="our-story">
          <h2 id="our-story">Our Story</h2>
          <p>
            What started as a passion for strong design and high-quality printing has grown into a platform built to
            serve modern businesses—whether you’re launching a startup, scaling an e-commerce brand, or supporting a
            national sales team with materials that look sharp and perform in the real world.
          </p>
          <p>
            We’re not just a vendor. We’re a partner that understands the details—paper stocks, coatings, color
            consistency, turnaround, shipping expectations—and we build workflows that keep your projects moving.
          </p>
        </section>

        <section aria-labelledby="mission-values">
          <h2 id="mission-values">Our Mission & Values</h2>
          <p>
            Our mission is simple: make it easy for brands to get professional-grade print and packaging without the
            headaches. We focus on the outcomes that matter most to you—quality, reliability, and support.
          </p>

          <ul>
            <li>
              <strong>Premium Quality</strong> — materials that last, colors that pop, finishes that impress.
            </li>
            <li>
              <strong>Fair Pricing</strong> — efficient production and transparent value.
            </li>
            <li>
              <strong>On-Time Delivery</strong> — because deadlines aren’t optional.
            </li>
            <li>
              <strong>Personal Support</strong> — real people who help you get it right.
            </li>
          </ul>
        </section>

        <section aria-labelledby="what-we-do">
          <h2 id="what-we-do">What We Do</h2>
          <p>
            From everyday essentials to high-impact campaigns, we make it easy to order, customize, and deliver
            consistent materials for your team and your customers.
          </p>
          <ul>
            <li><strong>Print</strong> — business cards, flyers, postcards, brochures, signage, and more.</li>
            <li><strong>Packaging</strong> — product packaging and branded materials designed to elevate unboxing.</li>
            <li><strong>Promotional Products</strong> — brand-forward items that keep you top of mind.</li>
          </ul>
          <p>
            If you’re not sure what you need, we’ll help you choose options that match your goals, budget, and timeline.
          </p>
        </section>

        <section aria-labelledby="closing">
          <h2 id="closing">Let’s Build Something Unforgettable</h2>
          <p>
            Your brand is our canvas. When you’re ready, explore our products, request a custom quote, or reach out to
            our team. We’ll help you ship work you’re proud to put your name on.
          </p>
          <p>
            <a href="/products">Browse products</a> · <a href="/quote">Request a quote</a> ·{" "}
            <a href="/contact">Contact support</a>
          </p>
        </section>
      </article>
    </main>
  );
}
