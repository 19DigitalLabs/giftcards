import Link from "next/link";
import type { BrandSummary } from "@/lib/catalogue/queries";
import { categoryEmoji } from "@/lib/giftcards";
import { formatBps } from "@/lib/money";
import { BrandChip } from "@/components/brand-chip";
import { Tag } from "@/components/ui";

/** One brand tile in a grid. */
export function BrandCard({ summary }: { summary: BrandSummary }) {
  const { brand, maxDiscountBps, purchasable } = summary;
  return (
    <Link
      href={`/brands/${brand.slug}`}
      className="group rounded-3xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-accent-soft-border hover:shadow-violet"
    >
      <div className="flex items-start justify-between gap-3">
        <BrandChip
          name={brand.name}
          color={brand.color}
          logoPath={brand.logoPath}
        />
        {!purchasable ? (
          <Tag variant="neutral">Unavailable</Tag>
        ) : maxDiscountBps > 0 ? (
          <Tag variant="lime">Save up to {formatBps(maxDiscountBps)}</Tag>
        ) : null}
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
