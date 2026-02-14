import "./globals.css";

import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import NotificationBar from "@/components/NotificationBar";
import SupportBanner from "@/components/SupportBanner";
import HeaderSlot from "@/components/slots/HeaderSlot";
import RouteProgressSlot from "@/components/slots/RouteProgressSlot";
import SiteFooter from "@/components/SiteFooter";
import SignupPromoSlot from "@/components/slots/SignupPromoSlot";

import { cfUrl } from "@/lib/data";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  width: "device-width",
  initialScale: 1,
};

function envStr(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

function envOpt(name: string): string | undefined {
  const v = envStr(name);
  return v ? v : undefined;
}

const SITE = envStr("NEXT_PUBLIC_SITE_URL").replace(/\/+$/, "") || "https://adapnow.com";
const SITE_NAME = "American Design And Printing";

const DEFAULT_OG = envOpt("DEFAULT_SOCIAL_SHARE_IMAGE_ID")
  ? cfUrl(envStr("DEFAULT_SOCIAL_SHARE_IMAGE_ID"))
  : undefined;

const SOCIALS = [
  envOpt("NEXT_PUBLIC_TWITTER_URL"),
  envOpt("NEXT_PUBLIC_FACEBOOK_URL"),
  envOpt("NEXT_PUBLIC_INSTAGRAM_URL"),
  envOpt("NEXT_PUBLIC_LINKEDIN_URL"),
  envOpt("NEXT_PUBLIC_YOUTUBE_URL"),
].filter(Boolean) as string[];

const SUPPORT_PHONE = envStr("NEXT_PUBLIC_SUPPORT_PHONE");
const SUPPORT_EMAIL = envStr("NEXT_PUBLIC_SUPPORT_EMAIL");

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  applicationName: SITE_NAME,
  title: "Custom Print Experts | American Design And Printing",
  description:
    "Your one-stop for trade printing—business cards, banners, invitations, and more. Powered by SinaLite.",
  manifest: "/site.webmanifest",

  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  verification: {
    google: envOpt("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION"),
    other: {
      ...(envOpt("NEXT_PUBLIC_BING_SITE_VERIFICATION")
        ? { "msvalidate.01": envStr("NEXT_PUBLIC_BING_SITE_VERIFICATION") }
        : {}),
      ...(envOpt("NEXT_PUBLIC_FACEBOOK_SITE_VERIFICATION")
        ? { "facebook-domain-verification": envStr("NEXT_PUBLIC_FACEBOOK_SITE_VERIFICATION") }
        : {}),
      ...(envOpt("NEXT_PUBLIC_PINTEREST_SITE_VERIFICATION")
        ? { "p:domain_verify": envStr("NEXT_PUBLIC_PINTEREST_SITE_VERIFICATION") }
        : {}),
    },
  },

  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#0047ab" }],
  },

  keywords: [
    "trade printing",
    "custom printing",
    "business cards",
    "banners",
    "postcards",
    "large format",
    "American Design And Printing",
  ],

  alternates: {
    canonical: "/",
    languages: { "en-US": "/", "x-default": "/" },
  },

  openGraph: {
    title: "Custom Print Experts | American Design And Printing",
    description: "Shop business cards, postcards, signs, and custom print products—delivered fast!",
    url: SITE,
    siteName: SITE_NAME,
    images: DEFAULT_OG
      ? [{ url: DEFAULT_OG, width: 1200, height: 630, alt: "American Design And Printing" }]
      : undefined,
    locale: "en_US",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Custom Print Experts | American Design And Printing",
    description: "Premium print & promo with blazing fast shipping.",
    images: DEFAULT_OG ? [DEFAULT_OG] : undefined,
    site: envOpt("NEXT_PUBLIC_TWITTER_HANDLE"),
    creator: envOpt("NEXT_PUBLIC_TWITTER_HANDLE"),
  },

  referrer: "strict-origin-when-cross-origin",
  category: "technology",
  authors: [{ name: SITE_NAME, url: SITE }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const publishableKey = envOpt("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");

  if (!publishableKey && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn("⚠️ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing");
  }

  const logoObj = DEFAULT_OG
    ? { "@type": "ImageObject", url: DEFAULT_OG, width: 1200, height: 630 }
    : undefined;

  const contactPoint =
    SUPPORT_PHONE || SUPPORT_EMAIL
      ? [
          {
            "@type": "ContactPoint",
            telephone: SUPPORT_PHONE || undefined,
            email: SUPPORT_EMAIL || undefined,
            contactType: "customer service",
            areaServed: "US",
            availableLanguage: ["English"],
          },
        ]
      : undefined;

  const siteNav = [
    { name: "Home", href: "/" },
    { name: "Products", href: "/products" },
    { name: "Cart", href: "/cart" },
    { name: "Review Order", href: "/cart/review" },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}#org`,
        name: SITE_NAME,
        url: SITE,
        logo: logoObj || DEFAULT_OG || undefined,
        sameAs: SOCIALS.length ? SOCIALS : undefined,
        contactPoint,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}#website`,
        url: SITE,
        name: SITE_NAME,
        publisher: { "@id": `${SITE}#org` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE}/search?query={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "SiteNavigationElement",
        "@id": `${SITE}#site-navigation`,
        name: siteNav.map((i) => i.name),
        url: siteNav.map((i) => `${SITE}${i.href}`),
      },
    ],
  };

  return (
    <html lang="en">
      <head>
        {/* Preconnects / DNS Prefetch */}
        <link rel="dns-prefetch" href="https://imagedelivery.net" />
        <link rel="preconnect" href="https://imagedelivery.net" crossOrigin="anonymous" />

        <link rel="dns-prefetch" href="https://liveapi.sinalite.com" />
        <link rel="preconnect" href="https://liveapi.sinalite.com" crossOrigin="anonymous" />

        <link rel="dns-prefetch" href="https://api.sinaliteuppy.com" />
        <link rel="preconnect" href="https://api.sinaliteuppy.com" crossOrigin="anonymous" />

        <link rel="dns-prefetch" href="https://assets.clerk.dev" />
        <link rel="preconnect" href="https://assets.clerk.dev" crossOrigin="anonymous" />

        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Algolia CSS (global for now; can be scoped later to search route) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/instantsearch.css@8.5.1/themes/satellite.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@algolia/autocomplete-theme-classic@1.19.2/dist/theme.min.css"
        />

        {/* Structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>

      <body className="app-shell">
        <ClerkProvider
          publishableKey={publishableKey}
          appearance={{
            variables: {
              colorPrimary: "#0047ab",
              borderRadius: "14px",
              fontSize: "16px",
            },
            elements: {
              rootBox: "clerk-root",
              card: "clerk-card",
              header: "clerk-header",
              headerTitle: "clerk-headerTitle",
              headerSubtitle: "clerk-headerSubtitle",
              form: "clerk-form",
              formFieldInput: "clerk-input",
              formFieldLabel: "clerk-label",
              formFieldAction: "clerk-action",
              formButtonPrimary: "clerk-primaryBtn",
              socialButtons: "clerk-socialGrid",
              socialButtonsBlockButton: "clerk-socialBtn",
              socialButtonsProviderIcon: "clerk-socialIcon",
              socialButtonsBlockButtonText: "clerk-socialText",
              footer: "clerk-footer",
            },
          }}
        >
          <Suspense fallback={null}>
            <RouteProgressSlot />
          </Suspense>

          {/* Above header (highest visibility) */}
          <NotificationBar />

          <Suspense fallback={null}>
            <HeaderSlot />
          </Suspense>

          <SupportBanner />

          <main className="app-main">{children}</main>

          <SiteFooter />

          <SignupPromoSlot />
        </ClerkProvider>
      </body>
    </html>
  );
}
