import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const brands = await db.brand.findMany({
    where: { status: { not: "DISABLED" } },
    select: { slug: true, updatedAt: true },
  });
  const pages = [
    "",
    "/brands",
    "/about",
    "/contact",
    "/support",
    "/terms",
    "/privacy",
    "/refund-policy",
  ];
  return [
    ...pages.map((p) => ({ url: `${base}${p}` })),
    ...brands.map((b) => ({
      url: `${base}/brands/${b.slug}`,
      lastModified: b.updatedAt,
    })),
  ];
}
