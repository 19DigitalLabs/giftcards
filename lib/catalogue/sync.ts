import type { AvailabilityStatus } from "@prisma/client";
import { audit, type ActorType } from "../audit";
import { db } from "../db";
import { log } from "../log";
import { computePrice } from "../pricing";
import { getProvider } from "../fulfilment/providers";
import { DEMO_SLUGS } from "../demo/catalogue-data";

/*
 * Catalogue sync: provider catalogue → our Brand/Product tables.
 *
 *  - Provider data (names, terms, validity, cost, availability) is copied.
 *  - Our business data (customer discount, admin disable) is preserved.
 *  - Selling prices are recomputed from cost + our discount (lib/pricing).
 *  - Products the provider no longer lists are DISABLED, not deleted, so
 *    historical orders keep their product.
 *  - Existing orders never change: their prices were snapshotted.
 */

export interface SyncSummary {
  provider: string;
  brandsCreated: number;
  brandsUpdated: number;
  productsCreated: number;
  productsUpdated: number;
  productsDelisted: number;
}

function effective(
  providerStatus: AvailabilityStatus,
  adminDisabled: boolean,
): AvailabilityStatus {
  return adminDisabled ? "DISABLED" : providerStatus;
}

function slugFor(providerCode: string, brandRef: string): string {
  const base =
    DEMO_SLUGS[brandRef] ?? brandRef.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return providerCode === "DEMO"
    ? base
    : `${base}-${providerCode.toLowerCase()}`;
}

export async function syncCatalogue(
  providerCode: string,
  actor: { type: ActorType; id?: string } = { type: "SYSTEM" },
): Promise<SyncSummary> {
  const adapter = getProvider(providerCode);
  const catalogue = await adapter.getCatalogue();
  const now = new Date();
  const summary: SyncSummary = {
    provider: providerCode,
    brandsCreated: 0,
    brandsUpdated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    productsDelisted: 0,
  };

  const provider = await db.provider.upsert({
    where: { code: adapter.code },
    update: {},
    create: { code: adapter.code, name: adapter.name, isDemo: adapter.isDemo },
  });
  const source = adapter.isDemo ? "DEMO" : adapter.code;

  const brandIds = new Map<string, { id: string; discountBps: number }>();
  for (const b of catalogue.brands) {
    const existing = await db.brand.findUnique({
      where: {
        providerId_providerBrandRef: {
          providerId: provider.id,
          providerBrandRef: b.brandRef,
        },
      },
    });
    const providerFields = {
      name: b.name,
      category: b.category,
      description: b.description,
      color: b.color,
      logoPath: b.logoPath ?? null,
      terms: b.terms,
      howToRedeem: b.howToRedeem,
      termsSource: source,
      validityMonths: b.validityMonths,
      providerStatus: b.status,
      lastSyncedAt: now,
    };
    if (existing) {
      const brand = await db.brand.update({
        where: { id: existing.id },
        data: {
          ...providerFields,
          status: effective(b.status, existing.adminDisabled),
        },
      });
      brandIds.set(b.brandRef, {
        id: brand.id,
        discountBps: brand.discountBps,
      });
      summary.brandsUpdated++;
    } else {
      const brand = await db.brand.create({
        data: {
          ...providerFields,
          slug: slugFor(adapter.code, b.brandRef),
          providerId: provider.id,
          providerBrandRef: b.brandRef,
          status: b.status,
          featured: b.featured,
          // Seed our discount from the demo hint; real providers: 0 until set.
          discountBps: adapter.isDemo ? (b.suggestedDiscountBps ?? 0) : 0,
        },
      });
      brandIds.set(b.brandRef, {
        id: brand.id,
        discountBps: brand.discountBps,
      });
      summary.brandsCreated++;
    }
  }

  const seen = new Set<string>();
  for (const p of catalogue.products) {
    const brand = brandIds.get(p.brandRef);
    if (!brand) continue;
    seen.add(p.productRef);
    const existing = await db.product.findUnique({
      where: {
        providerId_providerProductRef: {
          providerId: provider.id,
          providerProductRef: p.productRef,
        },
      },
    });
    const price = computePrice({
      faceValuePaise: p.faceValuePaise,
      costPricePaise: p.costPaise,
      discountBps: existing?.discountBps ?? brand.discountBps,
    });
    const fields = {
      brandId: brand.id,
      name: `₹${(p.faceValuePaise / 100).toLocaleString("en-IN")} gift card`,
      denominationType: "FIXED" as const,
      faceValuePaise: p.faceValuePaise,
      currency: p.currency,
      costPricePaise: price.costPricePaise,
      sellingPricePaise: price.sellingPricePaise,
      providerStatus: p.status,
      pricingSource: source,
      lastSyncedAt: now,
    };
    if (existing) {
      await db.product.update({
        where: { id: existing.id },
        data: {
          ...fields,
          status: effective(p.status, existing.adminDisabled),
        },
      });
      summary.productsUpdated++;
    } else {
      await db.product.create({
        data: {
          ...fields,
          providerId: provider.id,
          providerProductRef: p.productRef,
          sku: `${adapter.code}-${p.productRef}`,
          status: p.status,
        },
      });
      summary.productsCreated++;
    }
  }

  const delisted = await db.product.updateMany({
    where: {
      providerId: provider.id,
      providerProductRef: { notIn: [...seen] },
      providerStatus: { not: "DISABLED" },
    },
    data: { providerStatus: "DISABLED", status: "DISABLED", lastSyncedAt: now },
  });
  summary.productsDelisted = delisted.count;

  await audit({
    action: "CATALOGUE_SYNCED",
    entityType: "Provider",
    entityId: provider.id,
    actorType: actor.type,
    actorId: actor.id,
    data: { ...summary },
  });
  log.info("catalogue.synced", { ...summary });
  return summary;
}

/** Re-prices one brand's products after an admin discount change. */
export async function repriceBrand(brandId: string): Promise<number> {
  const brand = await db.brand.findUniqueOrThrow({
    where: { id: brandId },
    include: { products: true },
  });
  let n = 0;
  for (const product of brand.products) {
    if (product.faceValuePaise == null || product.costPricePaise == null)
      continue;
    const price = computePrice({
      faceValuePaise: product.faceValuePaise,
      costPricePaise: product.costPricePaise,
      discountBps: product.discountBps ?? brand.discountBps,
    });
    await db.product.update({
      where: { id: product.id },
      data: { sellingPricePaise: price.sellingPricePaise },
    });
    n++;
  }
  return n;
}
