import type { MetadataRoute } from "next";
import { isDemoMode, siteUrl } from "@/lib/config";

/* Demo/staging deployments are never indexed. */
export default function robots(): MetadataRoute.Robots {
  if (isDemoMode()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/account",
        "/orders",
        "/payment",
        "/checkout",
        "/cart",
        "/api",
        "/demo",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
