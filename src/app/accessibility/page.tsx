import "server-only";

import type { Metadata, Viewport } from "next";
import Link from "next/link";

export const viewport: Viewport = {
  themeColor: "#000000",
};

const siteName = "American Design And Printing";
const brandShort = "ADAP";
const canonicalUrl = "https://americandesignandprinting.com/accessibility"; // ✅ change if different

// ✅ IMPORTANT: Use a stable date that only changes when you actually update this page.
// This avoids "always changing" content that looks auto-generated to users + search engines.
const LAST_UPDATED = "2026-02-03";

export const metadata: Metadata = {
  title: `Accessibility Statement | ${brandShort}`,
  description:
    `${siteName} (${brandShort}) is committed to digital accessibility. Read our accessibility statement, WCAG alignment goals, compatibility notes, and how to request assistance or report an issue.`,
  alternates: {
    canonical: canonicalUrl,
  },
  robots: {
    index: true,
    follow: true,
  },
  keywords: [
    "accessibility statement",
    "WCAG 2.1 AA",
    "digital accessibility",
    "ADA compliance",
    "accessible website",
    "screen reader compatibility",
    "keyboard navigation",
    "ADAP accessibility",
    "American Design And Printing accessibility",
  ],
  openGraph: {
    type: "website",
    url: canonicalUrl,
    title: `Accessibility Statement | ${brandShort}`,
    description:
      `Learn how ${siteName} (${brandShort}) supports accessibility, our WCAG alignment goals, and how to contact us for assistance or to report an issue.`,
    siteName,
  },
  twitter: {
    card: "summary_large_image",
    title: `Accessibility Statement | ${brandShort}`,
    description:
      `Read ${brandShort}'s accessibility statement, WCAG alignment goals, and how to request help or report accessibility issues.`,
  },
};

export default function AccessibilityPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="rounded-2xl border bg-white p-6">
        <h1 className="text-3xl font-extrabold">Accessibility Statement</h1>
        <p className="mt-2 text-sm text-slate-500">
          Last updated: <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time>
        </p>

        <p className="mt-4 text-slate-700">
          <strong>{siteName}</strong> (<strong>{brandShort}</strong>) is
          committed to ensuring digital accessibility for people with
          disabilities. We are continually improving the user experience for
          everyone and applying relevant accessibility standards to help provide
          an inclusive experience across our website and services.
        </p>
      </header>

      <section className="mt-8 space-y-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">Accessibility Standards &amp; Goals</h2>

        <p className="text-slate-700">
          Our goal is to align with the{" "}
          <strong>Web Content Accessibility Guidelines (WCAG) 2.1</strong> at{" "}
          <strong>Level AA</strong> where reasonably possible. We evaluate our
          website and digital content using a combination of automated tools and
          manual checks, and we prioritize improvements that enhance usability
          for keyboard-only users, screen reader users, and other assistive
          technology users.
        </p>

        <p className="text-slate-700">
          Accessibility is an ongoing effort. As we add new features and content
          (including product pages, checkout flows, and marketing materials), we
          aim to design and build with accessibility in mind.
        </p>
      </section>

      <section className="mt-8 space-y-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">Compatibility &amp; Assistive Technology</h2>

        <p className="text-slate-700">
          We aim to support common browsers and assistive technologies. Our site
          is designed to be compatible with:
        </p>

        <ul className="list-disc space-y-2 pl-6 text-slate-700">
          <li>Modern browsers (Chrome, Firefox, Safari, Edge)</li>
          <li>Keyboard navigation and visible focus states</li>
          <li>Screen readers and text-to-speech tools</li>
          <li>Zoom and responsive layouts for various screen sizes</li>
        </ul>

        <p className="text-slate-700">
          If you experience difficulty using the site with a specific browser,
          device, or assistive technology, please let us know so we can improve
          compatibility.
        </p>
      </section>

      <section className="mt-8 space-y-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">Known Limitations</h2>

        <p className="text-slate-700">
          While we work to ensure a fully accessible experience, some content or
          third-party integrations may not yet fully meet accessibility
          standards. This can include embedded content, external tools, or
          certain interactive components.
        </p>

        <p className="text-slate-700">
          We welcome feedback on any part of the experience that may be improved
          and we will make reasonable efforts to address accessibility barriers.
        </p>
      </section>

      <section className="mt-8 space-y-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">Feedback &amp; Contact</h2>

        <p className="text-slate-700">
          If you need assistance, encounter an accessibility barrier, or would
          like to request information in an alternative format, please contact
          us. We aim to respond as quickly as possible and will work with you to
          provide the support you need.
        </p>

        <div className="rounded-xl border bg-slate-50 p-4">
          <p className="text-slate-700">
            <strong>Best way to reach us:</strong>{" "}
            <Link href="/contact" className="text-blue-700 underline">
              Contact Us
            </Link>
          </p>

          <p className="mt-2 text-sm text-slate-600">
            When reporting an issue, it helps to include:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-slate-600">
            <li>The page URL (or the page name)</li>
            <li>What you were trying to do</li>
            <li>What went wrong (and any error message)</li>
            <li>Your device, browser, and assistive technology (if used)</li>
          </ul>
        </div>
      </section>

      <section className="mt-8 space-y-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">Ongoing Improvements</h2>

        <p className="text-slate-700">
          We are committed to continuous improvement and regularly review our
          website to identify and address accessibility issues. Updates may
          include improving color contrast, refining keyboard navigation,
          enhancing semantic structure, and ensuring meaningful alternative text
          where applicable.
        </p>

        <p className="text-slate-700">
          Thank you for visiting {siteName}. We appreciate your feedback and the
          opportunity to make our site better for everyone.
        </p>
      </section>
    </main>
  );
}
