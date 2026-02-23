// next.config.ts
import type { NextConfig } from "next";

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // ✅ REQUIRED for OpenNext build layout expectation:
  // creates .next/standalone/.next/server/pages-manifest.json
  output: "standalone",

  // (optional but commonly useful)
  // reactStrictMode: true,
};

export default nextConfig;