import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { ProfileForm } from "@/components/account-forms";
import { OrderStatusTag } from "@/components/order-status-tag";
import { ResendVerificationForm } from "@/components/resend-verification-form";
import { Card, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/account");
  const { password } = await searchParams;
  const [orderCount, openTickets, recent] = await Promise.all([
    db.order.count({ where: { userId: user.id } }),
    db.supportTicket.count({
      where: { userId: user.id, status: { in: ["OPEN", "AWAITING_CUSTOMER"] } },
    }),
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { items: { select: { brandName: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      {password === "reset" && (
        <Notice variant="success">
          Password reset — you&apos;ve been signed out of every other device.
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/orders"
          className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
        >
          <p className="text-xs font-bold text-muted-foreground">Orders</p>
          <p className="mt-1 font-display text-2xl font-extrabold">
            {orderCount}
          </p>
        </Link>
        <Link
          href="/account/support"
          className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
        >
          <p className="text-xs font-bold text-muted-foreground">
            Open tickets
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold">
            {openTickets}
          </p>
        </Link>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-bold text-muted-foreground">
            Member since
          </p>
          <p className="mt-1 font-display text-lg font-extrabold">
            {formatDate(user.createdAt.toISOString(), "en-IN")}
          </p>
        </div>
      </div>

      <Card>
        <h2 className="font-display text-lg font-extrabold">
          Personal details
        </h2>
        <div className="mt-5 space-y-5">
          <ProfileForm name={user.name} />
          <div className="max-w-md">
            <p className="text-sm font-bold">Email</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              {user.email}
              {user.emailVerifiedAt ? (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                  Verified
                </span>
              ) : (
                <span className="rounded-full bg-orange/15 px-2 py-0.5 text-xs font-bold text-orange">
                  Not verified
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              To change your email address,{" "}
              <Link
                href="/account/support/new"
                className="text-primary hover:underline"
              >
                contact support
              </Link>
              .
            </p>
          </div>
        </div>
      </Card>

      {!user.emailVerifiedAt && (
        <Card>
          <h2 className="font-display text-lg font-extrabold">
            Verify your email
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You need a verified email to buy gift cards.
          </p>
          <div className="mt-4 max-w-sm space-y-3">
            <ResendVerificationForm />
            {isDemoMode() && (
              <Link
                href="/demo/emails"
                className="block text-xs font-bold text-primary hover:underline"
              >
                Open the demo inbox →
              </Link>
            )}
          </div>
        </Card>
      )}

      {recent.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-extrabold">
              Recent orders
            </h2>
            <Link
              href="/orders"
              className="text-sm font-bold text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {recent.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 hover:text-primary"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {[...new Set(o.items.map((i) => i.brandName))].join(", ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <span className="font-mono">{o.id}</span> ·{" "}
                      {formatDate(o.createdAt.toISOString(), "en-IN")}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <OrderStatusTag status={o.status} />
                    <span className="text-sm font-bold">
                      {formatINR(o.totalPaise)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
