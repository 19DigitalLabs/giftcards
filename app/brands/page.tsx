import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@platform/utils";
import { db } from "@/lib/db";
import { categoryEmoji } from "@/lib/giftcards";
import { BrandCard } from "@/components/brand-card";
import { BrandSearch } from "@/components/brand-search";
import { Section } from "@/components/ui";

export const metadata: Metadata = {
  title: "Brands",
  description: "Browse and search all gift card brands.",
};

const chip = "rounded-full border px-4 py-2 text-xs font-bold transition-colors";
const chipIdle =
  "border-border text-muted-foreground hover:border-primary/60 hover:text-primary";
const chipActive = "border-primary bg-primary text-primary-foreground";

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.category === "string" ? params.category : "";

  const [brands, allCategories] = await Promise.all([
    db.brand.findMany({
      where: {
        ...(q ? { name: { contains: q } } : {}),
        ...(category ? { category } : {}),
      },
      orderBy: [{ featured: "desc" }, { cashbackPct: "desc" }],
    }),
    db.brand.findMany({ select: { category: true }, distinct: ["category"] }),
  ]);
  const categories = allCategories.map((c) => c.category).sort();

  return (
    <Section>
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
        All the brands 🛍️
      </h1>
      <p className="mt-3 text-muted-foreground">
        Every card earns Gems 💎 (1 Gem = ₹1) — full rate on UPI, straight to
        your wallet.
      </p>

      <BrandSearch defaultValue={q} className="mt-7 max-w-xl" />

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/brands" className={cn(chip, category === "" ? chipActive : chipIdle)}>
          All
        </Link>
        {categories.map((c) => (
          <Link
            key={c}
            href={`/brands?category=${encodeURIComponent(c)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={cn(chip, category === c ? chipActive : chipIdle)}
          >
            {categoryEmoji(c)} {c}
          </Link>
        ))}
      </div>

      {brands.length === 0 ? (
        <p className="mt-10 rounded-3xl border border-border bg-card p-8 text-sm text-muted-foreground">
          Nothing matches {q ? `"${q}"` : "that filter"} 😅 — try another search
          or{" "}
          <Link href="/brands" className="font-bold text-primary hover:underline">
            clear filters
          </Link>
          .
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <BrandCard key={brand.id} brand={brand} />
          ))}
        </div>
      )}
    </Section>
  );
}
