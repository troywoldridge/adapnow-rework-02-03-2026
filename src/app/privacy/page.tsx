import type { Metadata } from "next";

function readEnv(key: string): string | null {
  const v = process.env[key];
  if (!v) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function getSiteBaseUrl(): string {
  return (
    readEnv("NEXT_PUBLIC_SITE_URL") ||
    readEnv("SITE_URL") ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function safeAbsoluteUrlMaybe(
  url: string | null | undefined,
  baseUrl: string
): string | null {
  if (!url) return null;
  const s = String(url).trim();
  if (!s) return null;

  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return joinUrl(baseUrl, s);

  return null;
}

function getCfImagesAccountHash(): string | null {
  return (
    readEnv("NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH") ||
    readEnv("CF_IMAGES_ACCOUNT_HASH") ||
    readEnv("CLOUDFLARE_IMAGES_ACCOUNT_HASH") ||
    null
  );
}

function getCfImageVariant(): string {
  return (
    readEnv("NEXT_PUBLIC_CF_OG_IMAGE_VARIANT") ||
    readEnv("CF_OG_IMAGE_VARIANT") ||
    "socialShare"
  );
}

function buildCfImagesUrl(imageId: string | null | undefined): string | null {
  const id = imageId ? String(imageId).trim() : "";
  if (!id) return null;

  const accountHash = getCfImagesAccountHash();
  if (!accountHash) return null;

  const variant = getCfImageVariant();
  return `https://imagedelivery.net/${accountHash}/${id}/${variant}`;
}

function getSocialShareImageUrl(baseUrl: string): string | null {
  const id =
    readEnv("DEFAULT_SOCIAL_SHARE_IMAGE_ID") ||
    readEnv("NEXT_PUBLIC_DEFAULT_SOCIAL_SHARE_IMAGE_ID") ||
    readEnv("NEXT_PUBLIC_CF_LOGO_ID") ||
    null;

  // Support literal URLs too (if you ever switch away from CF Images IDs)
  const maybeUrl = safeAbsoluteUrlMaybe(id, baseUrl);
  if (maybeUrl) return maybeUrl;

  return buildCfImagesUrl(id);
}

function getPrivacyEmail(): string {
  // Prefer configurable, but default to your current value
  return (
    readEnv("PRIVACY_EMAIL") ||
    readEnv("NEXT_PUBLIC_PRIVACY_EMAIL") ||
    "privacy@adap.com"
  ).trim();
}

function getLastUpdated(): string {
  // Set one of these to a real policy date (recommended):
  // PRIVACY_POLICY_LAST_UPDATED=2026-02-15
  // NEXT_PUBLIC_PRIVACY_POLICY_LAST_UPDATED=2026-02-15
  //
  // Use ISO date so it's unambiguous and stable.
  return (
    readEnv("PRIVACY_POLICY_LAST_UPDATED") ||
    readEnv("NEXT_PUBLIC_PRIVACY_POLICY_LAST_UPDATED") ||
    "2026-02-15"
  ).trim();
}

function formatPrettyDate(iso: string): string {
  // Lightweight stable formatting without locale randomness.
  // Expect ISO YYYY-MM-DD; fall back to raw if unexpected.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const mm = months[month - 1];
  if (!mm || !year || !day) return iso;
  return `${mm} ${day}, ${year}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = getSiteBaseUrl();

  const title = "Privacy Policy | American Design And Printing";
  const description =
    "Read the Privacy Policy for American Design And Printing (ADAP). Learn how we collect, use, and protect your data.";

  const canonical = joinUrl(baseUrl, "/privacy");
  const ogImage = getSocialShareImageUrl(baseUrl);

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    alternates: { canonical },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: "American Design And Printing",
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default function PrivacyPage() {
  const baseUrl = getSiteBaseUrl();
  const canonical = joinUrl(baseUrl, "/privacy");

  const brandName =
    readEnv("NEXT_PUBLIC_SITE_NAME") || "American Design And Printing";

  const privacyEmail = getPrivacyEmail();
  const lastUpdatedIso = getLastUpdated();
  const lastUpdatedPretty = formatPrettyDate(lastUpdatedIso);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": joinUrl(baseUrl, "/#website"),
        url: baseUrl,
        name: brandName,
      },
      {
        "@type": "Organization",
        "@id": joinUrl(baseUrl, "/#organization"),
        name: brandName,
        url: baseUrl,
      },
      {
        "@type": "WebPage",
        "@id": canonical,
        url: canonical,
        name: "Privacy Policy",
        description:
          "Read the Privacy Policy for American Design And Printing (ADAP). Learn how we collect, use, and protect your data.",
        isPartOf: { "@id": joinUrl(baseUrl, "/#website") },
        about: { "@id": joinUrl(baseUrl, "/#organization") },
      },
    ],
  };

  return (
    <main className="container mx-auto px-6 py-12 prose">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1>Privacy Policy</h1>

      <p>
        <em>Last updated: {lastUpdatedPretty}</em>
      </p>

      <p>We respect your privacy and are committed to protecting your data.</p>

      <h2>What We Collect</h2>
      <p>
        We may collect your name, contact details, shipping/billing info, and
        files you upload for print.
      </p>

      <h2>How We Use Your Data</h2>
      <ul>
        <li>To process orders and deliver products</li>
        <li>To provide customer support</li>
        <li>To improve our services</li>
      </ul>

      <h2>Data Security</h2>
      <p>
        We use encryption, secure servers, and trusted third-party processors to
        keep your data safe.
      </p>

      <h2>Third-Party Services</h2>
      <p>
        Some orders are fulfilled via trusted partners (like Sinalite). Only the
        necessary data is shared.
      </p>

      <h2>Cookies</h2>
      <p>
        We use cookies to improve your browsing and shopping experience on our
        site.
      </p>

      <h2>Your Rights</h2>
      <p>
        You may request access, updates, or deletion of your personal
        information at any time.
      </p>

      <p>
        For privacy concerns, email us at{" "}
        <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
      </p>
    </main>
  );
}
