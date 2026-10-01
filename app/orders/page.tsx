import type { Metadata } from "next";
import type { OrderStatus } from "@prisma/client";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";
import { OrderStatusTag } from "@/components/order-status-tag";
import { buttonClasses, Notice, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Orders" };

const FILTERS: { label: string; value?: string; statuses?: OrderStatus[] }[] = [
  { label: "All" },
  { label: "Ready", value: "ready", statuses: ["FULFILLED"] },
  {
    label: "In progress",
    value: "progress",
    statuses: [
      "PAYMENT_PENDING",
      "PAID",
      "FULFILLING",
      "FULFILMENT_PENDING",
      "MANUAL_REVIEW",
    ],
  },
  {
    label: "Refunds",
    value: "refunds",
    statuses: ["FULFILMENT_FAILED", "REFUND_PENDING", "REFUNDED"],
  },
  {
    label: "Unsuccessful",
    value: "failed",
    statuses: ["PAYMENT_FAILED", "CANCELLED"],
  },
];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/orders");
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.value === params.status) ?? FILTERS[0]!;
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where: {
        userId: user.id,
        ...(filter.statuses ? { status: { in: filter.statuses } } : {}),
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
          Your gift card orders will appear here.
        </p>
        <Link
          href="/brands"
          className={`mt-7 inline-flex ${buttonClasses({ size: "lg" })}`}
        >
          Browse brands
        </Link>
      </Section>
    );
  }

  return (
    <Section>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Your orders
      </h1>
      {params.payment === "unverified" && (
        <Notice variant="error" className="mt-6 max-w-2xl">
          We couldn&apos;t verify that payment response. If you paid, your order
          updates automatically once our payment partner confirms it.
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
          No orders here.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {orders.map((order) => {
            const brands = [...new Set(order.items.map((i) => i.brandName))];
            const cards = order.items.reduce((n, i) => n + i.quantity, 0);
            return (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-accent-soft-border hover:shadow-violet"
                >
                  <div className="min-w-0">
                    <p className="font-display font-extrabold">
                      {brands.join(", ")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className="font-mono">{order.id}</span> ·{" "}
                      {formatDate(order.createdAt.toISOString(), "en-IN")} ·{" "}
                      {cards} gift card
                      {cards === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <OrderStatusTag status={order.status} />
                    <p className="font-display font-extrabold text-primary">
                      {formatINR(order.totalPaise)}
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
