import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction, logoutEverywhereAction } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { summarize } from "@/lib/catalogue/queries";
import { isDemoMode } from "@/lib/config";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { BrandCard } from "@/components/brand-card";
import { ChangePasswordForm } from "@/components/password-forms";
import { ResendVerificationForm } from "@/components/resend-verification-form";
import { Button, Card, Notice, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Account" };

const label =
  "text-xs font-extrabold tracking-widest text-muted-foreground uppercase";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/account");
  const { password } = await searchParams;
  const [orderCount, favorites] = await Promise.all([
    db.order.count({ where: { userId: user.id } }),
    db.favorite.findMany({
      where: { userId: user.id, brand: { status: { not: "DISABLED" } } },
      include: { brand: { include: { products: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <Section containerClassName="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Your account
      </h1>
      {password === "reset" && (
        <Notice variant="success" className="mt-6">
          Password reset — you&apos;ve been signed out of every other device.
        </Notice>
      )}

      <Card className="mt-7">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className={label}>Name</dt>
            <dd className="mt-0.5 font-display text-lg font-extrabold">
              {user.name}
            </dd>
          </div>
          <div>
            <dt className={label}>Email</dt>
            <dd className="mt-0.5">
              {user.email}{" "}
              {user.emailVerifiedAt ? (
                <span className="ml-2 text-xs font-bold text-primary">
                  ✓ verified
                </span>
              ) : (
                <span className="ml-2 text-xs font-bold text-orange">
                  not verified
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className={label}>Member since</dt>
            <dd className="mt-0.5">
              {formatDate(user.createdAt.toISOString(), "en-IN")}
            </dd>
          </div>
          <div>
            <dt className={label}>Orders</dt>
            <dd className="mt-0.5">
              {orderCount} ·{" "}
              <Link
                href="/orders"
                className="font-bold text-primary hover:underline"
              >
                view all
              </Link>
            </dd>
          </div>
        </dl>
        {!user.emailVerifiedAt && (
          <div className="mt-6 space-y-3">
            <Notice variant="info">Verify your email to buy gift cards.</Notice>
            <ResendVerificationForm />
            {isDemoMode() && (
              <Link
                href="/demo/emails"
                className="block text-center text-xs font-bold text-primary hover:underline"
              >
                Open the demo inbox
              </Link>
            )}
          </div>
        )}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <form action={logoutAction}>
            <Button variant="outline" className="w-full">
              Log out
            </Button>
          </form>
          <form action={logoutEverywhereAction}>
            <Button variant="ghost" className="w-full">
              Log out of all devices
            </Button>
          </form>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-display text-lg font-extrabold">Change password</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Other devices are signed out when you change it.
        </p>
        <div className="mt-5">
          <ChangePasswordForm />
        </div>
      </Card>

      <h2 className="mt-10 font-display text-2xl font-extrabold tracking-tight">
        Saved brands
      </h2>
      {favorites.length === 0 ? (
        <p className="mt-4 rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Tap ♡ Save on any{" "}
          <Link
            href="/brands"
            className="font-bold text-primary hover:underline"
          >
            brand page
          </Link>{" "}
          to keep it here.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {favorites.map((f) => (
            <BrandCard key={f.id} summary={summarize(f.brand)} />
          ))}
        </div>
      )}
    </Section>
  );
}
