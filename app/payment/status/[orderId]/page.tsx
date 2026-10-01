import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { retryPaymentAction } from "@/lib/actions/checkout";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { IN_PROGRESS, ORDER_STATUS_COPY } from "@/lib/order-display";
import { OrderProgressPoller } from "@/components/order-progress-poller";
import { SubmitButton } from "@/components/submit-button";
import { buttonClasses, Card, Notice, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Order status" };

const ICON = {
  progress: "⏳",
  success: "🎉",
  warning: "⚠️",
  neutral: "↩️",
} as const;

/** Where the buyer lands after the payment page. */
export default async function OrderStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderId } = await params;
  const { error } = await searchParams;
  const user = await requireUser(`/payment/status/${orderId}`);
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!order || order.userId !== user.id) notFound();

  const copy = ORDER_STATUS_COPY[order.status];
  const latest = order.payments[0];
  const resumeUrl =
    order.status === "PAYMENT_PENDING" && latest?.status === "CREATED"
      ? latest.redirectUrl
      : null;
  const canRetry =
    order.status === "PAYMENT_FAILED" || order.status === "CANCELLED";

  return (
    <Section containerClassName="max-w-xl" className="text-center">
      <p className="text-6xl">{ICON[copy.tone]}</p>
      <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight">
        {copy.headline}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        {resumeUrl
          ? "You haven't finished paying yet. Continue to the payment page to complete your order."
          : copy.body}
      </p>
      {typeof error === "string" && (
        <Notice variant="error" className="mx-auto mt-6 max-w-md">
          {error.slice(0, 200)}
        </Notice>
      )}

      <Card className="mt-8 text-left">
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Order</dt>
            <dd className="font-mono font-bold">{order.id}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Gift card value</dt>
            <dd>{formatINR(order.faceValuePaise)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="font-bold">{formatINR(order.totalPaise)}</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-8 flex flex-col items-center gap-4">
        {order.status === "FULFILLED" && (
          <Link
            href={`/orders/${order.id}`}
            className={buttonClasses({ size: "lg" })}
          >
            View your gift card
          </Link>
        )}
        {resumeUrl && (
          <Link href={resumeUrl} className={buttonClasses({ size: "lg" })}>
            Continue to payment →
          </Link>
        )}
        {IN_PROGRESS.includes(order.status) && !resumeUrl && (
          <OrderProgressPoller orderId={order.id} status={order.status} />
        )}
        {canRetry && (
          <div className="flex flex-wrap justify-center gap-3">
            <form action={retryPaymentAction.bind(null, order.id)}>
              <SubmitButton size="lg" pendingLabel="Opening payment…">
                Try again — {formatINR(order.totalPaise)}
              </SubmitButton>
            </form>
            <Link
              href="/cart"
              className={buttonClasses({ size: "lg", variant: "outline" })}
            >
              Back to cart
            </Link>
          </div>
        )}
        <Link
          href={`/orders/${order.id}`}
          className="text-sm font-bold text-primary hover:underline"
        >
          Order details
        </Link>
      </div>
    </Section>
  );
}
