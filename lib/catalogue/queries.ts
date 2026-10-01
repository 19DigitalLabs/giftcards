import type { Brand, Prisma, Product } from "@prisma/client";
import { db } from "../db";

/** Customer-visible statuses (DISABLED brands are hidden entirely). */
const VISIBLE: Prisma.BrandWhereInput = {
  status: { in: ["ACTIVE", "OUT_OF_STOCK"] },
};

export type BrandWithProducts = Brand & { products: Product[] };

export interface BrandSummary {
  brand: Brand;
  /** Best customer discount across purchasable products, in bps. */
  maxDiscountBps: number;
  purchasable: boolean;
}

export function purchasableProducts(brand: BrandWithProducts): Product[] {
  if (brand.status !== "ACTIVE") return [];
  return brand.products
    .filter(
      (p) => p.status === "ACTIVE" && p.faceValuePaise && p.sellingPricePaise,
    )
    .sort((a, b) => a.faceValuePaise! - b.faceValuePaise!);
}

export function summarize(brand: BrandWithProducts): BrandSummary {
  const products = purchasableProducts(brand);
  const maxDiscountBps = products.reduce(
    (max, p) =>
      Math.max(
        max,
        Math.floor(
          ((p.faceValuePaise! - p.sellingPricePaise!) * 10000) /
            p.faceValuePaise!,
        ),
      ),
    0,
  );
  return { brand, maxDiscountBps, purchasable: products.length > 0 };
}

export async function listBrands(
  filter: { q?: string; category?: string; featured?: boolean } = {},
) {
  const brands = await db.brand.findMany({
    where: {
      ...VISIBLE,
      ...(filter.q
        ? { name: { contains: filter.q, mode: "insensitive" } }
        : {}),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.featured ? { featured: true } : {}),
    },
    include: { products: true },
    orderBy: [{ featured: "desc" }, { name: "asc" }],
  });
  return brands.map(summarize);
}

export async function listCategories(): Promise<string[]> {
  const rows = await db.brand.findMany({
    where: VISIBLE,
    select: { category: true },
    distinct: ["category"],
  });
  return rows.map((r) => r.category).sort();
}

export async function getBrandBySlug(
  slug: string,
): Promise<BrandWithProducts | null> {
  return db.brand.findFirst({
    where: { slug, ...VISIBLE },
    include: { products: true },
  });
}
