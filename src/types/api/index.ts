// src/types/api/index.ts

export * from "./cart";
export * from "./orders";
export * from "./shipping";
export * from "./uploads";
export * from "./reviews";
export * from "./loyalty";
export * from "./checkout";

export type ApiOk<T = unknown> = { ok: true; data: T };
export type ApiError = { ok: false; error: string; code?: string };
export type ApiResponse<T = unknown> = ApiOk<T> | ApiError;
