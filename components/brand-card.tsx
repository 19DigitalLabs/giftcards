import Link from "next/link";
import type { Brand } from "@prisma/client";
import { categoryEmoji } from "@/lib/giftcards";
import { BrandChip } from "@/components/brand-chip";
import { Tag } from "@/components/ui";

/** One brand tile in a grid — lifts and glows toward the brand on hover. */
export function BrandCard({ brand }: { brand: Brand }) {
  return (
    <Link
      href={`/brands/${brand.slug}`}
      className="group rounded-3xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-accent-soft-border hover:shadow-violet"
    >
      <div className="flex items-start justify-between">
        <BrandChip name={brand.name} color={brand.color} slug={brand.slug} />
        <Tag variant="lime">💎 {brand.cashbackPct}% back</Tag>
      </div>
      <p className="mt-4 truncate font-display text-lg font-extrabold group-hover:text-primary">
        {brand.name}
      </p>
      <p className="mt-0.5 text-xs font-bold text-muted-foreground">
        {categoryEmoji(brand.category)} {brand.category}
      </p>
    </Link>
  );
}
