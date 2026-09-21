import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = new URL(process.env.APP_URL ?? "https://store.buildwithreys.com").origin;
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/account", "/orders", "/cart", "/checkout", "/sign-in", "/sign-up", "/seller", "/admin", "/sms"] },
    sitemap: origin + "/sitemap.xml",
  };
}
