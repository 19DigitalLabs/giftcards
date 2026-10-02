import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { summarize } from "@/lib/catalogue/queries";
import { db } from "@/lib/db";
import { BrandCard } from "@/components/brand-card";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Saved brands" };

export default async function SavedBrandsPage() {
  const user = await requireUser("/account/saved");
  const favorites = await db.favorite.findMany({
    where: { userId: user.id, brand: { status: { not: "DISABLED" } } },
    include: { brand: { include: { products: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (favorites.length === 0) {
    return (
      <Card>
        <h2 className="font-display text-lg font-extrabold">
          No saved brands yet
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap ♡ Save on any{" "}
          <Link
            href="/brands"
            className="font-bold text-primary hover:underline"
          >
            brand page
          </Link>{" "}
          to keep it here.
        </p>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {favorites.map((f) => (
        <BrandCard key={f.id} summary={summarize(f.brand)} />
      ))}
    </div>
  );
}
