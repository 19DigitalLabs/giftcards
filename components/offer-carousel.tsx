"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BrandChip } from "@/components/brand-chip";
import { buttonClasses, Tag } from "@/components/ui";

export interface CarouselOffer {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  brand: { slug: string; name: string; color: string; cashbackPct: number };
}

/* Each slide gets its own vibe from this rotating gradient set. */
const slideGradients = [
  "from-accent/40 via-pink/25 to-transparent",
  "from-pink/35 via-orange/20 to-transparent",
  "from-cyan/30 via-accent/25 to-transparent",
  "from-orange/30 via-pink/20 to-transparent",
  "from-accent/35 via-cyan/20 to-transparent",
];

/** Auto-advancing offer carousel with pill dots and prev/next controls. */
export function OfferCarousel({ offers }: { offers: CarouselOffer[] }) {
  const [index, setIndex] = useState(0);
  const count = offers.length;

  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 5000);
    return () => clearInterval(timer);
  }, [count]);

  if (count === 0) return null;

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <div
          className="flex transition-transform duration-500"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {offers.map((offer, i) => (
            <div
              key={offer.id}
              className={cn(
                "flex w-full shrink-0 flex-col-reverse items-center gap-6 bg-gradient-to-br p-7 sm:flex-row sm:justify-between sm:p-12",
                slideGradients[i % slideGradients.length],
              )}
            >
              <div className="max-w-lg">
                <Tag variant="lime">🔥 {offer.badge}</Tag>
                <h3 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                  {offer.title}
                </h3>
                <p className="mt-3 text-sm text-muted-foreground">
                  {offer.subtitle}
                </p>
                <Link
                  href={`/brands/${offer.brand.slug}`}
                  className={cn("mt-6", buttonClasses())}
                >
                  Grab it →
                </Link>
              </div>
              <div className="flex -rotate-3 flex-col items-center gap-3 transition-transform hover:rotate-0">
                <BrandChip
                  name={offer.brand.name}
                  color={offer.brand.color}
                  slug={offer.brand.slug}
                  size="lg"
                />
                <p className="rounded-full bg-primary px-4 py-1 text-xs font-extrabold text-primary-foreground">
                  UP TO {offer.brand.cashbackPct}% BACK IN GEMS 💎
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-2">
            {offers.map((offer, i) => (
              <button
                key={offer.id}
                type="button"
                aria-label={`Go to offer ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-2.5 rounded-full transition-all",
                  i === index
                    ? "w-8 bg-primary"
                    : "w-2.5 bg-muted hover:bg-accent-soft-border",
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous offer"
              onClick={() => setIndex((index - 1 + count) % count)}
              className="size-10 rounded-full border border-border font-bold transition-colors hover:border-primary/60 hover:text-primary"
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Next offer"
              onClick={() => setIndex((index + 1) % count)}
              className="size-10 rounded-full border border-border font-bold transition-colors hover:border-primary/60 hover:text-primary"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
