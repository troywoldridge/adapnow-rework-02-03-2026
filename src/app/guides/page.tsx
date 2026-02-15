// src/app/guides/page.tsx
import "server-only";

import type { Metadata } from "next";
import path from "node:path";
import { promises as fsp } from "node:fs";
import GuidesClient from "@/components/guides/GuidesClient";

export const runtime = "nodejs";        // we use fs
export const dynamic = "force-dynamic"; // read disk in dev (safe for prod too)

export type FileNode = {
  label: string;
  href: string;       // /guides/…
  sizeBytes: number;  // for display
  mtimeMs: number;    // for sitemap & sort
};

export type DirNode = {
  title: string;
  children: DirNode[];
  files: FileNode[];
};

function readEnv(key: string): string | null {
  const v = process.env[key];
  if (!v) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function joinUrl(base: string, p: string): string {
  const b = base.replace(/\/+$/, "");
  const pathPart = p.startsWith("/") ? p : `/${p}`;
  return `${b}${pathPart}`;
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
  // Make an OG-specific variant in CF Images if you want (1200x630).
  // You can change this later without code changes.
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
  // Prefer DEFAULT_SOCIAL_SHARE_IMAGE_ID (Cloudflare Images ID),
  // fallback to logo ID. Also supports literal absolute URLs if you ever switch.
  const raw =
    readEnv("DEFAULT_SOCIAL_SHARE_IMAGE_ID") ||
    readEnv("NEXT_PUBLIC_DEFAULT_SOCIAL_SHARE_IMAGE_ID") ||
    readEnv("NEXT_PUBLIC_CF_LOGO_ID") ||
    null;

  const maybeUrl = safeAbsoluteUrlMaybe(raw, baseUrl);
  if (maybeUrl) return maybeUrl;

  return buildCfImagesUrl(raw);
}

function getBrandName(): string {
  return readEnv("NEXT_PUBLIC_SITE_NAME") || "American Design And Printing";
}

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = getSiteBaseUrl();
  const canonical = joinUrl(baseUrl, "/guides");

  const title = "Artwork Setup Guides";
  const description =
    "Download print-ready PDF templates and file setup guides for every product.";

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

const GUIDES_ROOT = path.join(process.cwd(), "public", "guides");

function humanizeFolder(name: string) {
  return name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function humanizeFile(base: string) {
  let s = base.replace(/\.[^.]+$/, "");
  s = s.replace(/\s*\(\d+\)\s*$/, ""); // drop “(1)”
  s = s.replace(/[_-]+/g, " ");
  s = s.replace(/\s*x\s*/gi, " × "); // 12 × 24
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
  return s;
}

async function existsDir(abs: string): Promise<boolean> {
  try {
    const st = await fsp.stat(abs);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function readDirTree(dirAbs: string, rel = ""): Promise<DirNode> {
  const entries = await fsp.readdir(dirAbs, { withFileTypes: true });

  const children: DirNode[] = [];
  const files: FileNode[] = [];

  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // hide .DS_Store, etc.
    const abs = path.join(dirAbs, e.name);
    const relPath = path.posix.join(rel, e.name.replaceAll("\\", "/"));

    if (e.isDirectory()) {
      children.push(await readDirTree(abs, relPath));
    } else if (e.isFile() && /\.pdf$/i.test(e.name)) {
      const stat = await fsp.stat(abs);
      files.push({
        label: humanizeFile(e.name),
        href: "/guides/" + relPath,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }
  }

  children.sort((a, b) => a.title.localeCompare(b.title));
  files.sort((a, b) => a.label.localeCompare(b.label));

  return {
    title: humanizeFolder(path.basename(dirAbs)),
    children,
    files,
  };
}

async function loadGuides(): Promise<DirNode[]> {
  if (!(await existsDir(GUIDES_ROOT))) return [];

  const top = await fsp.readdir(GUIDES_ROOT, { withFileTypes: true });
  const out: DirNode[] = [];

  for (const dir of top) {
    if (!dir.isDirectory()) continue;
    if (dir.name.startsWith(".")) continue;

    out.push(await readDirTree(path.join(GUIDES_ROOT, dir.name), dir.name));
  }

  out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

export default async function GuidesPage() {
  const baseUrl = getSiteBaseUrl();
  const canonical = joinUrl(baseUrl, "/guides");
  const brandName = getBrandName();

  const supportEmail =
    readEnv("SUPPORT_EMAIL") || readEnv("NEXT_PUBLIC_SUPPORT_EMAIL");
  const supportPhone =
    readEnv("SUPPORT_PHONE") || readEnv("NEXT_PUBLIC_SUPPORT_PHONE");

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
        ...(contactPoint ? { contactPoint } : {}),
      },
      {
        "@type": "WebPage",
        "@id": canonical,
        url: canonical,
        name: "Artwork Setup Guides",
        description:
          "Download print-ready PDF templates and file setup guides for every product.",
        isPartOf: { "@id": joinUrl(baseUrl, "/#website") },
        about: { "@id": joinUrl(baseUrl, "/#organization") },
      },
    ],
  };

  const data = await loadGuides();

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <GuidesClient data={data} />
    </>
  );
}
