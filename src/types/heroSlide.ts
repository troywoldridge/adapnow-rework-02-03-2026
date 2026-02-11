// src/types/heroSlide.ts

export interface HeroSlide {
  id: string;

  imageUrl: string;
  alt: string;

  title: string;
  description: string;

  ctaText: string;
  ctaHref: string;

  [k: string]: unknown;
}
