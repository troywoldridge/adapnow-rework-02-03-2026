// src/config/site.ts

export const site = {
  name: "ADAP Now",
  domain: process.env.NEXT_PUBLIC_SITE_DOMAIN || "localhost:3000",
  supportEmail: process.env.SUPPORT_EMAIL || "support@example.com",
  supportPhone: process.env.SUPPORT_PHONE || "",
  currency: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || "USD",
};
