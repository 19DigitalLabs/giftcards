import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { toggleFavoriteAction } from "@/lib/actions/favorites";
import { getSessionUser } from "@/lib/auth";
import {
  getBrandBySlug,
  purchasableProducts,
  summarize,
} from "@/lib/catalogue/queries";
import { isDemoMode } from "@/lib/config";
import { db } from "@/lib/db";
import { categoryEmoji } from "@/lib/giftcards";
import { formatBps } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AddToCartForm } from "@/components/add-to-cart-form";
import { BrandChip } from "@/components/brand-chip";
import { Card, Notice, Section, Tag } from "@/components/ui";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const brand = await getBrandBySlug((await params).slug);
  return brand
    ? { title: `${brand.name} gift cards`, description: brand.description }
    : {};
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { unavailable } = await searchParams;
  const [brand, user] = await Promise.all([
    getBrandBySlug(slug),
    getSessionUser(),
  ]);
  if (!brand) notFound();

  const products = purchasableProducts(brand);
  const { maxDiscountBps } = summarize(brand);
  const isFavorite = user
    ? (await db.favorite.findUnique({
        where: { userId_brandId: { userId: user.id, brandId: brand.id } },
      })) !== null
    : false;
  const demoTerms = brand.termsSource === "DEMO";

  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[1fr_24rem]">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-5">
              <BrandChip
                name={brand.name}
                color={brand.color}
                logoPath={brand.logoPath}
                size="lg"
              />
              <div>
                <Tag variant="violet">
                  {categoryEmoji(brand.category)} {brand.category}
                </Tag>
                <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">
                  {brand.name}
                </h1>
                <div className="mt-2 flex flex-wrap gap-2">
                  {maxDiscountBps > 0 && (
                    <Tag variant="lime">
                      Save up to {formatBps(maxDiscountBps)}
                    </Tag>
                  )}
                  {brand.validityMonths && (
                    <Tag variant="neutral">
                      Valid {brand.validityMonths} months
                    </Tag>
                  )}
                </div>
              </div>
            </div>
            <form
              action={toggleFavoriteAction.bind(null, brand.id, brand.slug)}
            >
              <button
                aria-pressed={isFavorite}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-bold transition-all active:scale-95",
                  isFavorite
                    ? "border-pink/60 bg-pink/15 text-pink"
                    : "border-border text-muted-foreground hover:border-pink/60 hover:text-pink",
                )}
              >
                {isFavorite ? "♥ Saved" : "♡ Save"}
              </button>
            </form>
          </div>

          <p className="mt-7 max-w-2xl text-muted-foreground">
            {brand.description}
          </p>
          <p className="mt-3 max-w-2xl text-xs text-muted-foreground">
            {brand.name} gift cards are issued by the brand/its issuer. Gifts19
            is not the issuer and is not endorsed by {brand.name}.
          </p>

          <h2 className="mt-10 font-display text-xl font-extrabold">
            How to redeem
          </h2>
          <ol className="mt-4 max-w-2xl space-y-3 text-sm">
            {brand.howToRedeem.map((step, i) => (
              <li key={step} className="flex gap-4 rounded-2xl bg-card p-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display font-extrabold text-accent-foreground">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>

          <h2 className="mt-10 font-display text-xl font-extrabold">
            Terms & conditions
          </h2>
          {demoTerms && isDemoMode() && (
            <p className="mt-2 text-xs font-bold text-orange">
              Placeholder terms for the demo environment.
            </p>
          )}
          <ul className="mt-4 max-w-2xl space-y-2 rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {brand.terms.map((t) => (
              <li key={t} className="flex gap-2.5">
                <span className="text-primary">•</span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          {unavailable && (
            <Notice variant="error" className="mb-4">
              That gift card is temporarily unavailable.
            </Notice>
          )}
          {products.length > 0 ? (
            <AddToCartForm
              products={products.map((p) => ({
                id: p.id,
                faceValuePaise: p.faceValuePaise!,
                sellingPricePaise: p.sellingPricePaise!,
              }))}
            />
          ) : (
            <div className="text-sm">
              <p className="font-display text-lg font-extrabold">
                Temporarily unavailable
              </p>
              <p className="mt-2 text-muted-foreground">
                {brand.name} gift cards can&apos;t be purchased right now.
                Please check back later.
              </p>
            </div>
          )}
        </Card>
      </div>
    </Section>
  );
}
