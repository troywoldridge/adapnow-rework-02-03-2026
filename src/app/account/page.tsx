// src/app/account/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import AccountClient from "./AccountClient";
import { CATEGORIES_PATH } from "@/lib/paths";

const siteName = "American Design And Printing";
const brandShort = "ADAP";
const canonicalUrl = "https://americandesignandprinting.com/account"; // ✅ change if different

export const metadata: Metadata = {
  title: `My Account | ${brandShort}`,
  description:
    `Manage your ${brandShort} account: view orders, track shipments, update addresses, and manage your profile and security settings.`,
  alternates: {
    canonical: canonicalUrl,
  },

  // ✅ CRITICAL: account pages should not be indexed
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-snippet": 0,
      "max-image-preview": "none",
      "max-video-preview": 0,
    },
  },

  openGraph: {
    type: "website",
    url: canonicalUrl,
    title: `My Account | ${brandShort}`,
    description:
      `Manage your ${brandShort} account: orders, tracking, rewards, addresses, profile, and security.`,
    siteName,
  },
  twitter: {
    card: "summary",
    title: `My Account | ${brandShort}`,
    description:
      `Manage your ${brandShort} account: orders, tracking, addresses, profile, and security.`,
  },
};

export default async function AccountPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      <header className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 p-[1px] shadow-lg">
        <div className="rounded-2xl bg-white/95 p-6 sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                My Account
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                View orders, track shipments, manage addresses, and update your profile.
              </p>
            </div>

            <div className="mt-4 sm:mt-0">
              <Link
                href={CATEGORIES_PATH}
                aria-label="Continue shopping"
                className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                Continue shopping
              </Link>
            </div>
          </div>

          {/* Optional tiny note (helps user trust; no SEO impact) */}
          <p className="mt-4 text-xs text-gray-500">
            For your privacy, account pages are not indexed by search engines.
          </p>
        </div>
      </header>

      <section className="mt-8" aria-label="Account dashboard">
        <AccountClient />
      </section>
    </main>
  );
}
