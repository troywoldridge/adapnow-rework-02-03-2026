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

  const maybeUrl = safeAbsoluteUrlMaybe(id, baseUrl);
  if (maybeUrl) return maybeUrl;

  return buildCfImagesUrl(id);
}

function getBrandName(): string {
  return readEnv("NEXT_PUBLIC_SITE_NAME") || "American Design And Printing";
}

function getSupportEmail(): string {
  return (readEnv("SUPPORT_EMAIL") || readEnv("NEXT_PUBLIC_SUPPORT_EMAIL") || "support@adap.com").trim();
}

function getSupportPhone(): string | null {
  const v = readEnv("SUPPORT_PHONE") || readEnv("NEXT_PUBLIC_SUPPORT_PHONE");
  return v ? v.trim() : null;
}

function getAddressLines(): string[] {
  // Recommended envs:
  // BUSINESS_ADDRESS_LINE1=171 Main St
  // BUSINESS_ADDRESS_LINE2=Suite 100 (optional)
  // BUSINESS_CITY=Vanceburg
  // BUSINESS_STATE=KY
  // BUSINESS_POSTAL=41179
  // BUSINESS_COUNTRY=US (optional)
  const line1 = readEnv("BUSINESS_ADDRESS_LINE1");
  const line2 = readEnv("BUSINESS_ADDRESS_LINE2");
  const city = readEnv("BUSINESS_CITY");
  const state = readEnv("BUSINESS_STATE");
  const postal = readEnv("BUSINESS_POSTAL");
  const country = readEnv("BUSINESS_COUNTRY");

  const lines: string[] = [];
  lines.push(getBrandName());

  if (line1) lines.push(line1);
  if (line2) lines.push(line2);

  const cityLine = [city, state, postal].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);

  if (country) lines.push(country);

  return lines;
}

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = getSiteBaseUrl();
  const canonical = joinUrl(baseUrl, "/contact");

  const title = "Contact Us | American Design And Printing";
  const description =
    "Get in touch with American Design And Printing (ADAP). We’d love to hear from you!";

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
      siteName: getBrandName(),
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

export default function ContactPage() {
  const baseUrl = getSiteBaseUrl();
  const canonical = joinUrl(baseUrl, "/contact");

  const brandName = getBrandName();
  const supportEmail = getSupportEmail();
  const supportPhone = getSupportPhone();
  const addressLines = getAddressLines();

  const facebookUrl = readEnv("NEXT_PUBLIC_FACEBOOK_URL");
  const instagramUrl = readEnv("NEXT_PUBLIC_INSTAGRAM_URL");
  const sameAs = [facebookUrl, instagramUrl].filter(
    (x): x is string => !!x && !!String(x).trim()
  );

  const contactPoint =
    (supportEmail && supportEmail.trim()) || (supportPhone && supportPhone.trim())
      ? [
          {
            "@type": "ContactPoint",
            ...(supportEmail && supportEmail.trim()
              ? { email: supportEmail.trim() }
              : {}),
            ...(supportPhone && supportPhone.trim()
              ? { telephone: supportPhone.trim() }
              : {}),
            contactType: "customer support",
          },
        ]
      : undefined;

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
        ...(sameAs.length ? { sameAs } : {}),
        ...(contactPoint ? { contactPoint } : {}),
      },
      {
        "@type": "ContactPage",
        "@id": canonical,
        url: canonical,
        name: "Contact Us",
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

      <h1>Contact Us</h1>
      <p>We’d love to hear from you! Reach us through the options below:</p>

      <h2>Address</h2>
      <p>
        {addressLines.map((line, idx) => (
          <span key={idx}>
            {line}
            <br />
          </span>
        ))}
      </p>

      <h2>Phone</h2>
      {supportPhone ? <p>{supportPhone}</p> : <p>Phone number coming soon.</p>}

      <h2>Email</h2>
      <p>
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
      </p>

      <h2>Online Form</h2>
      <p>
        You can also reach out through our <a href="/contact/form">contact form</a>,
        and we’ll respond within 1 business day.
      </p>
    </main>
  );
}
