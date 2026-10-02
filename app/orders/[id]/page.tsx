import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { IN_PROGRESS, ORDER_STATUS_COPY } from "@/lib/order-display";
import { formatDate } from "@/lib/utils";
import { maskCode } from "@/lib/vouchers";
import { BrandChip } from "@/components/brand-chip";
import { OrderProgressPoller } from "@/components/order-progress-poller";
import { OrderStatusTag } from "@/components/order-status-tag";
import { buttonClasses, Card, Notice, Section } from "@/components/ui";
import { VoucherReveal } from "@/components/voucher-reveal";

export const metadata: Metadata = { title: "Order details" };

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/orders/${id}`);
  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: { include: { brand: true } },
          // Only safe columns — never the encrypted code/PIN.
          vouchers: {
            where: { status: "ACTIVE" },
            select: {
              id: true,
              codeLast4: true,
              isTest: true,
              expiresAt: true,
              unitIndex: true,
            },
            orderBy: { unitIndex: "asc" },
          },
        },
      },
    },
  });
  if (!order || order.userId !== user.id) notFound();

  const copy = ORDER_STATUS_COPY[order.status];
  const showCodes =
    order.status === "FULFILLED" || order.status === "MANUAL_REVIEW";

  return (
    <Section>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Order {order.id}
        </h1>
        <OrderStatusTag status={order.status} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Placed {formatDate(order.createdAt.toISOString(), "en-IN")}
      </p>

      {order.status !== "FULFILLED" && (
        <Notice
          variant={copy.tone === "warning" ? "error" : "info"}
          className="mt-6 max-w-2xl"
        >
          {copy.body}
        </Notice>
      )}
      {IN_PROGRESS.includes(order.status) && (
        <div className="mt-4 max-w-2xl">
          <OrderProgressPoller orderId={order.id} status={order.status} />
        </div>
      )}
      {(order.status === "PAYMENT_FAILED" || order.status === "CANCELLED") && (
        <Link
          href={`/payment/status/${order.id}`}
          className={`mt-4 inline-flex ${buttonClasses({ variant: "outline" })}`}
        >
          Try payment again
        </Link>
      )}

      <ul className="mt-8 space-y-4">
        {order.items.map((item) => (
          <li
            key={item.id}
            className="rounded-3xl border border-border bg-card p-5"
          >
            <div className="flex flex-wrap items-center gap-4">
              <BrandChip
                name={item.brandName}
                color={item.product.brand.color}
                logoPath={item.product.brand.logoPath}
              />
              <div className="min-w-0 flex-1">
                <p className="font-display font-extrabold">
                  {item.brandName} gift card · {formatINR(item.faceValuePaise)}{" "}
                  × {item.quantity}
                </p>
                <Link
                  href={`/brands/${item.product.brand.slug}`}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  How to redeem & terms
                </Link>
              </div>
              <p className="font-display font-extrabold">
                {formatINR(item.sellingPricePaise * item.quantity)}
              </p>
            </div>
            {showCodes && item.vouchers.length > 0 && (
              <div className="mt-5 space-y-3 border-t border-border pt-4">
                <p className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
                  Your gift card codes
                </p>
                {item.vouchers.map((v) => (
                  <div key={v.id}>
                    <VoucherReveal
                      voucherId={v.id}
                      masked={maskCode(v.codeLast4)}
                      isTest={v.isTest}
                    />
                    {v.expiresAt && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Valid till{" "}
                        {formatDate(v.expiresAt.toISOString(), "en-IN")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <Card className="mt-8 max-w-sm">
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Gift card value</dt>
            <dd>{formatINR(order.faceValuePaise)}</dd>
          </div>
          <div className="flex justify-between text-primary">
            <dt>Discount</dt>
            <dd>−{formatINR(order.discountPaise)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Payment fee</dt>
            <dd>{formatINR(order.feePaise)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-base font-extrabold">
            <dt>{order.status === "REFUNDED" ? "Refunded" : "Total"}</dt>
            <dd>{formatINR(order.totalPaise)}</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/orders" className={buttonClasses({ variant: "outline" })}>
          ← All orders
        </Link>
        <Link
          href={`/account/support/new?order=${order.id}`}
          className={buttonClasses({ variant: "ghost" })}
        >
          Get help with this order
        </Link>
      </div>
    </Section>
  );
}
