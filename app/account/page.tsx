import type { Metadata } from "next";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { logoutAction } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatGems } from "@/lib/giftcards";
import { getPreferredMethod } from "@/lib/prefs";
import { BrandCard } from "@/components/brand-card";
import { Button, Card, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Account" };

const label = "text-xs font-extrabold tracking-widest text-muted-foreground uppercase";

export default async function AccountPage() {
  const user = await requireUser("/account");
  const [orderCount, wallet, favorites, method] = await Promise.all([
    db.order.count({ where: { userId: user.id } }),
    db.order.aggregate({
      _sum: { cashback: true },
      where: { userId: user.id, status: "COMPLETED" },
    }),
    db.favorite.findMany({
      where: { userId: user.id },
      include: { brand: true },
      orderBy: { createdAt: "desc" },
    }),
    getPreferredMethod(),
  ]);
  const walletBalance = wallet._sum.cashback ?? 0;

  return (
    <Section containerClassName="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Your account
      </h1>

      <div className="mt-7 rounded-3xl bg-gradient-to-br from-accent/30 via-pink/20 to-orange/15 p-6">
        <p className={label}>Gems wallet 💎</p>
        <p className="mt-1 font-display text-4xl font-extrabold text-primary">
          {formatGems(walletBalance)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          1 Gem = ₹1, earned across your completed orders. Withdrawals coming
          soon.
        </p>
      </div>

      <Card className="mt-4">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className={label}>Name</dt>
            <dd className="mt-0.5 font-display text-lg font-extrabold">{user.name}</dd>
          </div>
          <div>
            <dt className={label}>Email</dt>
            <dd className="mt-0.5">{user.email}</dd>
          </div>
          <div>
            <dt className={label}>Member since</dt>
            <dd className="mt-0.5">{formatDate(user.createdAt.toISOString())}</dd>
          </div>
          <div>
            <dt className={label}>Preferred payment</dt>
            <dd className="mt-0.5 font-bold">
              {method.emoji} {method.label}
              <span className="ml-2 font-normal text-muted-foreground">
                — change it on any gift card page or at checkout
              </span>
            </dd>
          </div>
          <div>
            <dt className={label}>Orders</dt>
            <dd className="mt-0.5">
              {orderCount} ·{" "}
              <Link href="/orders" className="font-bold text-primary hover:underline">
                view all
              </Link>
            </dd>
          </div>
        </dl>
        <form action={logoutAction} className="mt-7">
          <Button variant="outline" className="w-full">
            Log out 👋
          </Button>
        </form>
      </Card>

      <h2 className="mt-10 font-display text-2xl font-extrabold tracking-tight">
        Your favourites {favorites.length > 0 && `(${favorites.length})`} 💖
      </h2>
      {favorites.length === 0 ? (
        <p className="mt-4 rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Nothing saved yet — tap ♡ Save on any{" "}
          <Link href="/brands" className="font-bold text-primary hover:underline">
            gift card page
          </Link>{" "}
          and it&apos;ll show up here.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {favorites.map((f) => (
            <BrandCard key={f.id} brand={f.brand} />
          ))}
        </div>
      )}
    </Section>
  );
}
