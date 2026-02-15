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

function safeAbsoluteUrlMaybe(url: string | null | undefined, baseUrl: string): string | null {
  if (!url) return null;
  const s = String(url).trim();
  if (!s) return null;

  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return joinUrl(baseUrl, s);

  return null;
}

function getCfImagesAccountHash(): string | null {
  // Prefer a single source, but allow common variations.
  return (
    readEnv("NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH") ||
    readEnv("CF_IMAGES_ACCOUNT_HASH") ||
    readEnv("CLOUDFLARE_IMAGES_ACCOUNT_HASH") ||
    null
  );
}

function getCfImageVariant(): string {
  // A dedicated OG variant is best (e.g. 1200x630), but you can change later.
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
  // If you set DEFAULT_SOCIAL_SHARE_IMAGE_ID, we use it.
  // Otherwise fallback to NEXT_PUBLIC_CF_LOGO_ID.
  const id =
    readEnv("DEFAULT_SOCIAL_SHARE_IMAGE_ID") ||
    readEnv("NEXT_PUBLIC_DEFAULT_SOCIAL_SHARE_IMAGE_ID") ||
    readEnv("NEXT_PUBLIC_CF_LOGO_ID") ||
    null;

  // If they provided a literal URL instead of an ID, support it.
  const maybeUrl = safeAbsoluteUrlMaybe(id, baseUrl);
  if (maybeUrl) return maybeUrl;

  // Otherwise treat as Cloudflare Images ID.
  return buildCfImagesUrl(id);
}

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = getSiteBaseUrl();

  const title = "Customer Reviews | American Design And Printing";
  const description =
    "See what customers are saying about American Design And Printing. Share your experience with us!";

  const canonical = joinUrl(baseUrl, "/reviews");
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

export default function ReviewsPage() {
  const baseUrl = getSiteBaseUrl();
  const canonical = joinUrl(baseUrl, "/reviews");

  const googleReviewsUrl = readEnv("NEXT_PUBLIC_GOOGLE_REVIEWS_URL");
  const facebookUrl = readEnv("NEXT_PUBLIC_FACEBOOK_URL");
  const instagramUrl = readEnv("NEXT_PUBLIC_INSTAGRAM_URL");

  const brandName =
    readEnv("NEXT_PUBLIC_SITE_NAME") || "American Design And Printing";

  const supportEmail =
    readEnv("SUPPORT_EMAIL") || readEnv("NEXT_PUBLIC_SUPPORT_EMAIL");
  const supportPhone =
    readEnv("SUPPORT_PHONE") || readEnv("NEXT_PUBLIC_SUPPORT_PHONE");

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
        "@type": "WebPage",
        "@id": canonical,
        url: canonical,
        name: "Customer Reviews",
        description:
          "See what customers are saying about American Design And Printing. Share your experience with us!",
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

      <h1>Customer Reviews</h1>

      <p>
        We’re just getting started — soon you’ll be able to read and share real
        experiences from our customers right here.
      </p>

      <p>In the meantime, you can:</p>

      <ul>
        <li>
          {googleReviewsUrl ? (
            <>
              Leave a review on{" "}
              <a
                href={googleReviewsUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                Google Reviews
              </a>
              .
            </>
          ) : (
            <>
              Leave a review on <strong>Google Reviews</strong> (link coming soon).
            </>
          )}
        </li>

        <li>
          Connect with us on{" "}
          {facebookUrl ? (
            <a
              href={facebookUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Facebook
            </a>
          ) : (
            <strong>Facebook</strong>
          )}{" "}
          and{" "}
          {instagramUrl ? (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Instagram
            </a>
          ) : (
            <strong>Instagram</strong>
          )}
          .
        </li>

        <li>
          Send feedback directly through our <a href="/contact">Contact Page</a>.
        </li>
      </ul>

      <p>Your voice helps us grow — thank you for being part of our journey!</p>
    </main>
  );
}
