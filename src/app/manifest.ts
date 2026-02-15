import type { MetadataRoute } from "next";

function readEnv(key: string): string | null {
  const v = process.env[key];
  if (!v) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export default function manifest(): MetadataRoute.Manifest {
  const name =
    readEnv("NEXT_PUBLIC_SITE_NAME") ||
    readEnv("SITE_NAME") ||
    "American Design And Printing";

  const shortName =
    readEnv("NEXT_PUBLIC_SITE_SHORT_NAME") ||
    readEnv("SITE_SHORT_NAME") ||
    "ADAP";

  const description =
    readEnv("NEXT_PUBLIC_SITE_DESCRIPTION") ||
    readEnv("SITE_DESCRIPTION") ||
    "American Design And Printing — custom print, packaging, apparel.";

  const themeColor =
    readEnv("NEXT_PUBLIC_THEME_COLOR") ||
    readEnv("THEME_COLOR") ||
    "#0047ab";

  const backgroundColor =
    readEnv("NEXT_PUBLIC_BACKGROUND_COLOR") ||
    readEnv("BACKGROUND_COLOR") ||
    "#ffffff";

  return {
    id: "/", // stable app identity
    name,
    short_name: shortName,
    description,

    lang: "en",
    dir: "ltr",

    start_url: "/?source=pwa",
    scope: "/",

    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "portrait",

    theme_color: themeColor,
    background_color: backgroundColor,

    categories: ["shopping", "business", "productivity"],

    prefer_related_applications: false,

    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],

    shortcuts: [
      {
        name: "Contact Support",
        short_name: "Support",
        url: "/contact?source=pwa-shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Artwork Guides",
        short_name: "Guides",
        url: "/guides?source=pwa-shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
