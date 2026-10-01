import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, formatRupee } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { OrderStatusTag } from "@/components/order-status-tag";
import { buttonClasses, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage() {
  const user = await requireUser("/orders");
  const orders = await db.order.findMany({
    where: { userId: user.id },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (orders.length === 0) {
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
      <ul className="mt-8 space-y-4">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              href={`/orders/${order.id}`}
              className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-accent-soft-border hover:shadow-violet"
            >
              <div>
                <p className="font-display font-extrabold">{order.id}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(order.createdAt.toISOString())} ·{" "}
                  {order._count.items} item{order._count.items === 1 ? "" : "s"}
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
        ))}
      </ul>
    </Section>
  );
}
