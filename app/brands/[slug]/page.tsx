import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cn } from "@platform/utils";
import { setPaymentMethodAction, toggleFavoriteAction } from "@/lib/actions/prefs";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categoryEmoji, parseDenominations } from "@/lib/giftcards";
import { effectiveCashbackPct, PAYMENT_METHODS } from "@/lib/payments";
import { getPreferredMethod } from "@/lib/prefs";
import { AddToCartForm } from "@/components/add-to-cart-form";
import { BrandChip } from "@/components/brand-chip";
import { Card, Section, Tag } from "@/components/ui";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const brand = await db.brand.findUnique({ where: { slug } });
  if (!brand) return {};
  return {
    title: `${brand.name} gift cards — ${brand.cashbackPct}% back in Gems`,
    description: brand.description,
  };
}

export default async function BrandPage({ params }: Props) {
  const { slug } = await params;
  const [brand, method, user] = await Promise.all([
    db.brand.findUnique({ where: { slug } }),
    getPreferredMethod(),
    getSessionUser(),
  ]);
  if (!brand) notFound();

  const isFavorite = user
    ? (await db.favorite.findUnique({
        where: { userId_brandId: { userId: user.id, brandId: brand.id } },
      })) !== null
    : false;

  const denominations = parseDenominations(brand.denominations);
  const howToRedeem = JSON.parse(brand.howToRedeem) as string[];
  const terms = JSON.parse(brand.terms) as string[];

  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[1fr_24rem]">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-5">
              <BrandChip
                name={brand.name}
                color={brand.color}
                slug={brand.slug}
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
                  <Tag variant="lime">💎 Up to {brand.cashbackPct}% back in Gems</Tag>
                  <Tag variant="pink">Valid {brand.validityMonths} months</Tag>
                </div>
              </div>
            </div>
            <form action={toggleFavoriteAction.bind(null, brand.id, brand.slug)}>
              <button
                aria-pressed={isFavorite}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-all active:scale-95",
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

          {/* Selectable payment method — the pick carries to cart & checkout. */}
          <h2 className="mt-10 font-display text-xl font-extrabold">
            Pick how you&apos;ll pay 💎
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Gems are our cashback — 1 Gem = ₹1, credited to your wallet. Your
            pick is remembered for cart and checkout.
          </p>
          <div className="mt-4 max-w-2xl overflow-hidden rounded-3xl border border-border">
            {PAYMENT_METHODS.map((m, i) => {
              const selected = m.id === method.id;
              return (
                <form key={m.id} action={setPaymentMethodAction.bind(null, m.id)}>
                  <button
                    aria-pressed={selected}
                    className={cn(
                      "flex w-full items-center justify-between gap-4 p-4 text-left text-sm transition-colors",
                      i > 0 && "border-t border-border",
                      selected ? "bg-primary/10" : "bg-card hover:bg-muted",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "size-4 shrink-0 rounded-full border-2",
                          selected ? "border-primary bg-primary" : "border-border",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block font-bold">
                          {m.emoji} {m.label}
                          {m.id === "upi" && (
                            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-extrabold text-primary-foreground">
                              BEST
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {m.feePct > 0
                            ? `+${m.feePct}% convenience fee`
                            : "No convenience fee"}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-lg font-extrabold text-primary">
                      {effectiveCashbackPct(brand.cashbackPct, m)}%
                    </span>
                  </button>
                </form>
              );
            })}
          </div>

          <h2 className="mt-10 font-display text-xl font-extrabold">
            How to redeem 🎟️
          </h2>
          <ol className="mt-4 max-w-2xl space-y-3 text-sm">
            {howToRedeem.map((step, i) => (
              <li key={step} className="flex gap-4 rounded-2xl bg-card p-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display font-extrabold text-accent-foreground">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>

          <h2 className="mt-10 font-display text-xl font-extrabold">
            Terms & conditions 📄
          </h2>
          <ul className="mt-4 max-w-2xl space-y-2 rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {terms.map((t) => (
              <li key={t} className="flex gap-2.5">
                <span className="text-primary">•</span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          <AddToCartForm
            brandId={brand.id}
            denominations={denominations}
            cashbackPct={brand.cashbackPct}
            method={{
              label: method.label,
              emoji: method.emoji,
              feePct: method.feePct,
              cashbackFactor: method.cashbackFactor,
            }}
          />
        </Card>
      </div>
    </Section>
  );
}
