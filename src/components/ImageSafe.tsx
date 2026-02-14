// src/components/ImageSafe.tsx
"use client";

import NextImage, { type ImageProps } from "next/image";
import { getR2PublicHost } from "@/lib/artwork/r2Public";

/**
 * Safe wrapper that bypasses Next optimizer for Cloudflare Images + your R2 CDN.
 *
 * Why:
 * - Cloudflare Images (imagedelivery.net) is already optimized.
 * - Your R2 public CDN is already serving optimized assets (or you want to avoid double-optimizing).
 *
 * Notes:
 * - We compute the bypass host set at module load (client-side), and we guard against empty values.
 * - We only parse hostname when src is a string URL.
 */

// Build a dynamic bypass list for already-optimized CDNs
const BYPASS_HOSTS = new Set<string>(["imagedelivery.net", getR2PublicHost() || ""].filter(Boolean));

type Props = ImageProps;

function hostnameOf(src: string): string {
  try {
    // Accept absolute URLs only; relative paths will throw and return ""
    return new URL(src).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export default function ImageSafe({ src, unoptimized, ...rest }: Props) {
  const host = typeof src === "string" ? hostnameOf(src) : "";
  const finalUnoptimized = host && BYPASS_HOSTS.has(host) ? true : unoptimized;

  return <NextImage src={src} unoptimized={finalUnoptimized} {...rest} />;
}

// Optional: re-export an alias to keep older imports happy
export type NextImageProps = ImageProps;
export type { ImageProps as DefaultImageProps } from "next/image";
