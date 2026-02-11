// src/lib/r2.js
// Cloudflare R2 S3-compatible client (server-only). Used for uploads and server tasks.
// Public delivery to users should go through r2PublicUrl (CDN), not presigned S3 links.

import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

const R2_BUCKET = process.env.R2_BUCKET || process.env.R2_BUCKET_NAME;

if (!R2_ACCOUNT_ID) throw new Error("R2_ACCOUNT_ID missing");
if (!R2_ACCESS_KEY_ID) throw new Error("R2_ACCESS_KEY_ID missing");
if (!R2_SECRET_ACCESS_KEY) throw new Error("R2_SECRET_ACCESS_KEY missing");
if (!R2_BUCKET) throw new Error("R2_BUCKET missing");

export const R2 = new S3Client({
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: "auto",
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

export { R2_BUCKET };

export const R2_PUBLIC_BASEURL = String(
  process.env.R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASEURL || "",
).replace(/\/+$/, "");
