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

import { cfImage } from "@/lib/cfImages";

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

const defaultSocialImageId = envOpt("DEFAULT_SOCIAL_SHARE_IMAGE_ID");
const DEFAULT_OG = defaultSocialImageId ? cfImage(defaultSocialImageId, "public") : undefined;

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
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
            Skip to content
          </a>

          <RouteProgressSlot />
          <NotificationBar />
          <SupportBanner />

          <Suspense fallback={null}>
            <HeaderSlot />
          </Suspense>

          {children}

          <Suspense fallback={null}>
            <SignupPromoSlot />
          </Suspense>
          <SiteFooter socials={SOCIALS} supportPhone={SUPPORT_PHONE} supportEmail={SUPPORT_EMAIL} />
        </body>
      </html>
    </ClerkProvider>
  );
}
