import type { MetadataRoute } from "next";

/**
 * Robots config:
 * - Allow indexing of public pages
 * - Disallow sensitive/transactional areas
 * - Explicitly disallow Bytespider (ByteDance)
 * - Register BOTH sitemaps
 *
 * NOTE: Robots.txt is advisory. Use Cloudflare WAF/Firewall to enforce blocking.
 */
export default function robots(): MetadataRoute.Robots {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://americandesignandprinting.com").replace(
    /\/+$/,
    ""
  );

  return {
    rules: [
      // 🚫 Bad bot / aggressive crawler (often ignores robots, but we still declare it)
      {
        userAgent: "Bytespider",
        disallow: ["/"],
      },

      // ✅ Default rule for well-behaved crawlers
      {
        userAgent: "*",
        allow: [
          "/",
          // Allow Next static assets (safe + helps rendering)
          "/_next/static/",
          // If you rely on Next Image optimizer URLs, allow it:
          "/_next/image",
        ],
        disallow: [
          // Internal framework / misc
          "/_next/",
          "/static/",

          // APIs should not be indexed
          "/api/",

          // User areas / transactional
          "/account",
          "/orders",
          "/cart",
          "/checkout",

          // Admin / dashboards
          "/admin/",
          "/dashboard/",
        ],
      },
    ],

    // ✅ Both sitemaps
    sitemap: [`${site}/sitemap.xml`, `${site}/sitemap-jobs.xml`],
    host: site,
  };
}
