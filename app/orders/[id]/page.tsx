import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatRupee } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatGems } from "@/lib/giftcards";
import { decryptCodes, reconcileOrder } from "@/lib/orders";
import { getPaymentMethod } from "@/lib/payments";
import { BrandChip } from "@/components/brand-chip";
import { OrderStatusTag } from "@/components/order-status-tag";
import { buttonClasses, Card, Notice, Section, Tag } from "@/components/ui";
import { VoucherCode } from "@/components/voucher-code";

export const metadata: Metadata = { title: "Order details" };

const PAYMENT_LABEL: Record<string, string> = {
  CREATED: "⌛ not completed",
  PENDING: "⏳ pending",
  SUCCESS: "✅ success",
  FAILED: "❌ failed",
  CANCELLED: "↩️ cancelled",
};

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/orders/${id}`);
  const owned = await db.order.findUnique({
    where: { id },
    select: { userId: true, status: true },
  });
  if (!owned || owned.userId !== user.id) notFound();
  if (owned.status === "PENDING") await reconcileOrder(id);
  const order = await db.order.findUniqueOrThrow({
    where: { id },
    include: {
      items: { include: { brand: true } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });

  const method = getPaymentMethod(order.paymentMethod);

  return (
    <Section>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">
          {order.id}
        </h1>
        <OrderStatusTag status={order.status} />
        {order.status === "COMPLETED" && order.cashback > 0 && (
          <Tag variant="lime">💎 +{formatGems(order.cashback)} earned</Tag>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Placed {formatDate(order.createdAt.toISOString())} ·{" "}
        {order.status === "COMPLETED" ? "Paid via" : "Paying via"}{" "}
        {method ? `${method.emoji} ${method.label}` : order.paymentMethod}
        {order.paymentRef && (
          <>
            {" "}
            · Ref <span className="font-mono">{order.paymentRef}</span>
          </>
        )}
      </p>

      {order.status !== "COMPLETED" && (
        <Notice
          variant={order.status === "PENDING" ? "info" : "error"}
          className="mt-6 max-w-2xl"
        >
          {order.status === "PENDING"
            ? "Payment not confirmed yet — voucher codes appear here as soon as it is."
            : `${order.failureReason ?? "Payment didn't go through."} No codes were issued.`}{" "}
          <Link href={`/payment/status/${order.id}`} className="underline">
            {order.status === "PENDING"
              ? "Check payment status"
              : "Retry payment"}
          </Link>
        </Notice>
      )}

      <ul className="mt-8 space-y-4">
        {order.items.map((item) => {
          const codes = decryptCodes(item.codes);
          return (
            <li
              key={item.id}
              className="rounded-3xl border border-border bg-card p-5"
            >
              <div className="flex flex-wrap items-center gap-4">
                <BrandChip
                  name={item.brandName}
                  color={item.brand.color}
                  slug={item.brand.slug}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display font-extrabold">
                    {item.brandName} · {formatRupee(item.denomination)} ×{" "}
                    {item.quantity}
                  </p>
                  <p className="text-xs text-primary">
                    💎 {item.cashbackPct}% base Gems rate
                  </p>
                </div>
                <p className="font-display font-extrabold">
                  {formatRupee(item.denomination * item.quantity)}
                </p>
              </div>
              {codes.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
                    Voucher codes 🎟️
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {codes.map((code) => (
                      <li key={code}>
                        <VoucherCode code={code} />
                      </li>
                    ))}
                  </ul>
                  {item.expiresAt && (
                    <p
                      className={`mt-3 text-xs font-bold ${item.expiresAt < new Date() ? "text-pink" : "text-muted-foreground"}`}
                    >
                      {item.expiresAt < new Date() ? "Expired" : "Valid till"}{" "}
                      {formatDate(item.expiresAt.toISOString())}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    How to redeem + full T&Cs are on the{" "}
                    <Link
                      href={`/brands/${item.brand.slug}`}
                      className="font-bold text-primary hover:underline"
                    >
                      {item.brandName} page
                    </Link>
                    .
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Card className="mt-8 max-w-sm">
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Face value</dt>
            <dd>{formatRupee(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Convenience fee</dt>
            <dd className={order.fee > 0 ? "text-pink" : ""}>
              {order.fee > 0 ? `+ ${formatRupee(order.fee)}` : "Free"}
            </dd>
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-base font-extrabold">
            <dt>{order.status === "COMPLETED" ? "Paid" : "Amount"}</dt>
            <dd>{formatRupee(order.total)}</dd>
          </div>
          {order.status === "COMPLETED" && (
            <div className="flex justify-between text-primary">
              <dt className="font-bold">Gems earned 💎</dt>
              <dd className="font-bold">{formatGems(order.cashback)}</dd>
            </div>
          )}
        </dl>
      </Card>

      {order.payments.length > 0 && (
        <Card className="mt-4 max-w-sm">
          <h2 className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
            Payment attempts
          </h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            {order.payments.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-mono text-xs break-all">
                    {p.gatewayPaymentId}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.createdAt.toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {p.failureReason && ` · ${p.failureReason}`}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold">
                  {PAYMENT_LABEL[p.status] ?? p.status}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Link
        href="/orders"
        className={`mt-8 inline-flex ${buttonClasses({ variant: "outline" })}`}
      >
        ← All orders
      </Link>
    </Section>
  );
}
