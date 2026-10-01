import type { Metadata } from "next";
import Link from "next/link";
import { cn, formatDate, formatRupee } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { reconcilePendingOrders } from "@/lib/orders";
import { OrderStatusTag } from "@/components/order-status-tag";
import { buttonClasses, Notice, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Orders" };

const FILTERS = [
  { label: "All", value: undefined },
  { label: "Completed", value: "COMPLETED" },
  { label: "Pending", value: "PENDING" },
  { label: "Failed", value: "FAILED" },
  { label: "Cancelled", value: "CANCELLED" },
] as const;

const PAYMENT_NOTICES: Record<string, string> = {
  unverified:
    "We couldn't verify that payment response. If you paid, the order updates automatically once the gateway confirms.",
  unknown:
    "We couldn't match that payment to an order. Contact support if you were charged.",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/orders");
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.value === params.status) ?? FILTERS[0];
  const notice =
    typeof params.payment === "string"
      ? PAYMENT_NOTICES[params.payment]
      : undefined;

  await reconcilePendingOrders(user.id);
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where: {
        userId: user.id,
        ...(filter.value ? { status: filter.value } : {}),
      },
      include: { items: { select: { brandName: true, quantity: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.order.count({ where: { userId: user.id } }),
  ]);

  if (total === 0) {
    return (
      <Section className="text-center">
        <p className="text-6xl">📦</p>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight">
          No orders yet
        </h1>
        <p className="mt-3 text-muted-foreground">
          Your gift card orders and voucher codes will live here.
        </p>
        <Link
          href="/brands"
          className={`mt-7 inline-flex ${buttonClasses({ size: "lg" })}`}
        >
          Browse brands ✨
        </Link>
      </Section>
    );
  }

  return (
    <Section>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Your orders
      </h1>
      {notice && (
        <Notice variant="error" className="mt-6 max-w-2xl">
          {notice}
        </Notice>
      )}

      <nav aria-label="Filter orders" className="mt-7 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `/orders?status=${f.value}` : "/orders"}
            aria-current={f === filter ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-bold transition-colors",
              f === filter
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/50",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="mt-6 rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No {filter.label.toLowerCase()} orders.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {orders.map((order) => {
            const brands = [...new Set(order.items.map((i) => i.brandName))];
            const cards = order.items.reduce((n, i) => n + i.quantity, 0);
            return (
              <li key={order.id}>
                <Link
                  href={
                    order.status === "COMPLETED"
                      ? `/orders/${order.id}`
                      : `/payment/status/${order.id}`
                  }
                  className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-accent-soft-border hover:shadow-violet"
                >
                  <div className="min-w-0">
                    <p className="font-display font-extrabold">
                      {brands.slice(0, 3).join(", ")}
                      {brands.length > 3 && ` +${brands.length - 3} more`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className="font-mono">{order.id}</span> ·{" "}
                      {formatDate(order.createdAt.toISOString())} · {cards} card
                      {cards === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <OrderStatusTag status={order.status} />
                    <p className="font-display font-extrabold text-primary">
                      {formatRupee(order.total)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
