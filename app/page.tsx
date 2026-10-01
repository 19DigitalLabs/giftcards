import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { BrandCard } from "@/components/brand-card";
import { BrandSearch } from "@/components/brand-search";
import { OfferCarousel, type CarouselOffer } from "@/components/offer-carousel";
import { buttonClasses, Card, Section, Tag } from "@/components/ui";

const steps = [
  {
    emoji: "👆",
    title: "Pick a brand",
    text: "Search 25+ top Indian brands and choose a card value that fits.",
  },
  {
    emoji: "💎",
    title: "Earn Gems. Always.",
    text: "Pay face value, get up to 12% back in Gems (1 Gem = ₹1) — full rate on UPI, no coupon gymnastics.",
  },
  {
    emoji: "⚡",
    title: "Codes, instantly",
    text: "Voucher codes land in your order the second payment completes.",
  },
];

/* Floating hero stickers: emoji + position + animation delay. */
const stickers = [
  { emoji: "🎁", className: "top-6 right-[8%] text-5xl", delay: "0s" },
  { emoji: "✨", className: "top-32 right-[26%] text-3xl", delay: "1.2s" },
  { emoji: "🛍️", className: "bottom-24 right-[12%] text-4xl", delay: "0.6s" },
  { emoji: "💜", className: "bottom-8 right-[30%] text-3xl", delay: "1.8s" },
];

export default async function HomePage() {
  const [offers, brands, user] = await Promise.all([
    db.offer.findMany({ orderBy: { sort: "asc" } }),
    db.brand.findMany({ orderBy: { cashbackPct: "desc" } }),
    getSessionUser(),
  ]);

  const brandBySlug = new Map(brands.map((b) => [b.slug, b]));
  const carouselOffers: CarouselOffer[] = offers.flatMap((offer) => {
    const brand = brandBySlug.get(offer.brandSlug);
    return brand ? [{ ...offer, brand }] : [];
  });

  const topDiscounts = brands.slice(0, 8);
  const maxCashback = Math.max(...brands.map((b) => b.cashbackPct), 0);
  const tickerItems = brands.slice(0, 12);

  return (
    <>
      <Section className="relative overflow-hidden pb-10 sm:pb-14">
        {/* Ambient glow blobs behind the hero. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-accent/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-10 right-0 size-80 rounded-full bg-pink/15 blur-3xl"
        />
        {stickers.map((s) => (
          <span
            key={s.emoji}
            aria-hidden
            className={`pointer-events-none absolute hidden animate-float select-none sm:block ${s.className}`}
            style={{ animationDelay: s.delay }}
          >
            {s.emoji}
          </span>
        ))}

        <div className="relative">
          <Tag variant="violet">🇮🇳 India&apos;s gift card store</Tag>
          <h1 className="mt-5 max-w-3xl font-display text-5xl font-extrabold tracking-tight uppercase sm:text-7xl">
            Gift cards that <span className="text-gradient">hit different</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Up to{" "}
            <span className="font-bold text-primary">
              {maxCashback}% back in Gems 💎
            </span>{" "}
            on {brands.length} brands you actually use. 1 Gem = ₹1. Full rate on
            UPI. Instant codes. No cap.
          </p>
          <BrandSearch className="mt-8 max-w-xl" />
        </div>
      </Section>

      {/* Brand marquee — content duplicated once so -50% loops seamlessly. */}
      <div className="overflow-hidden border-y border-border bg-card/60 py-3">
        <div className="flex w-max animate-ticker gap-8">
          {[...tickerItems, ...tickerItems].map((brand, i) => (
            <Link
              key={`${brand.id}-${i}`}
              href={`/brands/${brand.slug}`}
              className="flex shrink-0 items-center gap-2 text-sm font-bold whitespace-nowrap text-muted-foreground transition-colors hover:text-primary"
            >
              <span style={{ color: brand.color }}>●</span>
              {brand.name}
              <span className="text-primary">+{brand.cashbackPct}% 💎</span>
            </Link>
          ))}
        </div>
      </div>

      <Section>
        <h2 className="font-display text-3xl font-extrabold tracking-tight">
          Today&apos;s drops 🔥
        </h2>
        <div className="mt-6">
          <OfferCarousel offers={carouselOffers} />
        </div>
      </Section>

      <Section className="pt-0">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-extrabold tracking-tight">
            Steal these deals
          </h2>
          <Link
            href="/brands"
            className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-bold transition-colors hover:border-primary/60 hover:text-primary"
          >
            All brands →
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {topDiscounts.map((brand) => (
            <BrandCard key={brand.id} brand={brand} />
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <h2 className="font-display text-3xl font-extrabold tracking-tight">
          How it works
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {steps.map((step) => (
            <Card key={step.title}>
              <p className="text-4xl">{step.emoji}</p>
              <h3 className="mt-3 font-display text-lg font-extrabold">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {step.text}
              </p>
            </Card>
          ))}
        </div>

        {!user && (
          <div className="mt-10 flex flex-col items-start gap-5 rounded-3xl bg-gradient-to-br from-accent/30 via-pink/20 to-orange/15 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div>
              <h2 className="font-display text-2xl font-extrabold sm:text-3xl">
                Free money energy 💅
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Join free — save your cart, track orders, keep every code in one
                place.
              </p>
            </div>
            <Link href="/signup" className={buttonClasses({ size: "lg" })}>
              Sign up, it&apos;s free ✨
            </Link>
          </div>
        )}
      </Section>
    </>
  );
}
