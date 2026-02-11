// src/lib/heroSlides.types.ts

/** A single slide for the homepage hero carousel */
export interface HeroSlide {
  id: string;
  imageUrl: string; // Cloudflare image URL or image ID
  alt: string;
  title: string;
  description?: string;

  ctaText?: string;
  ctaHref?: string;

  badge?: string;

  // presentation controls
  fit?: "cover" | "contain";
  focal?: string;

  /** Optional blur placeholder */
  blurDataURL?: string;
}

/**
 * Runtime validator for HeroSlide objects.
 * Helps prevent CMS/data mistakes from breaking the hero.
 */
export function isValidSlide(obj: unknown): obj is HeroSlide {
  if (typeof obj !== "object" || obj === null) return false;

  const s = obj as Record<string, unknown>;

  if (
    typeof s.id !== "string" ||
    typeof s.imageUrl !== "string" ||
    typeof s.alt !== "string" ||
    typeof s.title !== "string"
  ) {
    return false;
  }

  if (s.description !== undefined && typeof s.description !== "string") return false;
  if (s.ctaText !== undefined && typeof s.ctaText !== "string") return false;
  if (s.ctaHref !== undefined && typeof s.ctaHref !== "string") return false;
  if (s.badge !== undefined && typeof s.badge !== "string") return false;
  if (s.focal !== undefined && typeof s.focal !== "string") return false;
  if (s.blurDataURL !== undefined && typeof s.blurDataURL !== "string") return false;

  if (s.fit !== undefined && s.fit !== "cover" && s.fit !== "contain") {
    return false;
  }

  return true;
}
