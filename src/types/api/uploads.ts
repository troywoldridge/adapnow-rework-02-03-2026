// src/types/api/uploads.ts

export type PresignUploadRequest = {
  filename: string;
  contentType: string;
  prefix?: string;
};

export type PresignUploadResponse =
  | { url: string; headers?: Record<string, string>; publicUrl: string }
  | { putUrl: string; headers?: Record<string, string>; publicUrl: string };
