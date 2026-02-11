// src/types/api/reviews.ts

export type ReviewCreateRequest = {
  rating: number;
  title?: string;
  body?: string;
  productId?: number | string;
};

export type ReviewCreateResponse = {
  id: string | number;
  ok: true;
};
