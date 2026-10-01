import type { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { Table, td } from "@/components/admin-ui";
import { inputClasses } from "@/components/ui";

export const dynamic = "force-dynamic";

const ORDER_STATUSES: OrderStatus[] = [
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "CANCELLED",
  "PAID",
  "FULFILLING",
  "FULFILMENT_PENDING",
  "FULFILLED",
  "FULFILMENT_FAILED",
  "MANUAL_REVIEW",
  "REFUND_PENDING",
  "REFUNDED",
];
const PAYMENT_STATUSES: PaymentStatus[] = [
  "CREATED",
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
];

export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const str = (k: string) =>
    typeof p[k] === "string" ? (p[k] as string).trim() : "";
  const q = str("q");
  const status = ORDER_STATUSES.find((s) => s === str("status"));
  const paymentStatus = PAYMENT_STATUSES.find((s) => s === str("payment"));
  const from = str("from");
  const to = str("to");

  const where: Prisma.OrderWhereInput = {
    ...(q
      ? {
          OR: [
            { id: { contains: q, mode: "insensitive" } },
            { user: { email: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(paymentStatus ? { payments: { some: { status: paymentStatus } } } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
          },
        }
      : {}),
  };
  const orders = await db.order.findMany({
    where,
    include: {
      user: { select: { email: true } },
      payments: {
        select: { status: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold">Orders</h1>
      <form className="mt-5 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <input
          name="q"
          defaultValue={q}
          placeholder="Order id or customer email"
          className={inputClasses}
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className={inputClasses}
        >
          <option value="">Any order status</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="payment"
          defaultValue={paymentStatus ?? ""}
          className={inputClasses}
        >
          <option value="">Any payment status</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={from}
          className={inputClasses}
          aria-label="From date"
        />
        <input
          type="date"
          name="to"
          defaultValue={to}
          className={inputClasses}
          aria-label="To date"
        />
        <button className="h-12 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground">
          Filter
        </button>
      </form>
      <div className="mt-6">
        <Table
          head={[
            "Order",
            "Customer",
            "Status",
            "Payment",
            "Face",
            "Paid",
            "Created",
          ]}
        >
          {orders.map((o) => (
            <tr key={o.id}>
              <td className={td}>
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="font-mono font-bold text-primary hover:underline"
                >
                  {o.id}
                </Link>
                {o.isTest && (
                  <span className="ml-2 text-[10px] font-bold text-orange">
                    TEST
                  </span>
                )}
              </td>
              <td className={td}>{o.user.email}</td>
              <td className={td}>
                <span className="font-mono text-xs">{o.status}</span>
              </td>
              <td className={td}>
                <span className="font-mono text-xs">
                  {o.payments[0]?.status ?? "—"}
                </span>
              </td>
              <td className={td}>{formatINR(o.faceValuePaise)}</td>
              <td className={td}>{formatINR(o.totalPaise)}</td>
              <td className={`${td} whitespace-nowrap text-xs`}>
                {o.createdAt.toLocaleString("en-IN")}
              </td>
            </tr>
          ))}
        </Table>
        {orders.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">No orders match.</p>
        )}
      </div>
    </div>
  );
}
