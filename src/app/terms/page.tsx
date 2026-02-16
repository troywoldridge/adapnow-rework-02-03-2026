import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Terms of Service | American Design And Printing",
  description: "Read the Terms of Service for American Design And Printing (ADAP).",
  robots: { index: true, follow: true },
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Service | American Design And Printing",
    description: "Read the Terms of Service for American Design And Printing (ADAP).",
    url: "/terms",
    type: "article",
  },
};

function lastUpdatedLabel(): string {
  // Prefer a deploy-provided date; fall back to "today" (force-dynamic keeps it current).
  const raw =
    process.env.NEXT_PUBLIC_TERMS_LAST_UPDATED ||
    process.env.TERMS_LAST_UPDATED ||
    "";
  const s = String(raw).trim();
  if (s) return s;
  return new Date().toLocaleDateString();
}

export default function TermsPage() {
  const lastUpdated = lastUpdatedLabel();

  return (
    <main className="container mx-auto px-6 py-12 prose">
      <h1>Terms of Service</h1>
      <p>
        <em>Last updated: {lastUpdated}</em>
      </p>

      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of the American
        Design And Printing (&quot;ADAP&quot;) website and services (the &quot;Service&quot;). By accessing
        or using the Service, you agree to be bound by these Terms.
      </p>

      <ol>
        <li>
          <strong>Eligibility</strong> — You must be at least 18 years old or have
          parental/guardian consent to use the Service.
        </li>

        <li>
          <strong>Accounts</strong> — You are responsible for maintaining the confidentiality of
          your account credentials and for all activities that occur under your account.
        </li>

        <li>
          <strong>Products &amp; Pricing</strong> — All prices are subject to change without
          notice. We reserve the right to modify or discontinue products at any time.
        </li>

        <li>
          <strong>Orders &amp; Payment</strong> — Orders are final once placed (unless otherwise
          required by law). Payment must be completed before production begins.
        </li>

        <li>
          <strong>Production &amp; Delivery</strong> — Timelines are estimates. We are not liable
          for delays outside our control (e.g., shipping carriers, weather, customs).
        </li>

        <li>
          <strong>Artwork &amp; Customer Content</strong> — You represent that you have the rights
          to upload and submit any artwork, logos, text, and other materials. You grant ADAP a
          limited license to use such content solely to fulfill your order and provide support.
        </li>

        <li>
          <strong>Returns &amp; Refunds</strong> — Custom products are non-refundable except where
          required by law. If a product arrives defective or materially different from the
          approved proof/specs, contact us within 7 days for resolution.
        </li>

        <li>
          <strong>Intellectual Property</strong> — All site content, logos, and designs are owned
          by ADAP unless otherwise noted. You may not copy, modify, distribute, or create
          derivative works without permission.
        </li>

        <li>
          <strong>Prohibited Uses</strong> — You may not use the Service for unlawful activity, to
          infringe on intellectual property rights, or to upload malicious code/content.
        </li>

        <li>
          <strong>Limitation of Liability</strong> — To the maximum extent permitted by law, ADAP
          is not responsible for any indirect, incidental, special, consequential, or punitive
          damages arising from your use of the Service.
        </li>

        <li>
          <strong>Changes to These Terms</strong> — We may update these Terms from time to time.
          Changes will be posted on this page with an updated date.
        </li>
      </ol>

      <p>
        For questions about these Terms, please contact us at{" "}
        <a href="mailto:support@adap.com">support@adap.com</a>.
      </p>
    </main>
  );
}
