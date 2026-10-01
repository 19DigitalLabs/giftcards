import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatRupee } from "@/lib/utils";
import { retryPaymentAction } from "@/lib/actions/checkout";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatGems } from "@/lib/giftcards";
import { reconcileOrder } from "@/lib/orders";
import { getPaymentMethod } from "@/lib/payments";
import { PaymentStatusPoller } from "@/components/payment-status-poller";
import { SubmitButton } from "@/components/submit-button";
import { buttonClasses, Card, Notice, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Payment status" };

const VIEW = {
  COMPLETED: {
    emoji: "🎉",
    title: "Payment successful",
    body: "Your gift cards are ready — voucher codes are in your order.",
  },
  PENDING: {
    emoji: "⏳",
    title: "Payment pending",
    body: "We're waiting for your bank to confirm. This usually takes under a minute. You can leave this page — the order updates on its own and your codes will appear in Orders.",
  },
  FAILED: {
    emoji: "😕",
    title: "Payment failed",
    body: "No codes were issued. If money left your account, the bank refunds it automatically within 5–7 working days. Your cart is untouched.",
  },
  CANCELLED: {
    emoji: "↩️",
    title: "Payment cancelled",
    body: "You backed out before paying — nothing was charged. Your cart is untouched.",
  },
} as const;

/** Where the buyer lands after the gateway: success, pending or failure. */
export default async function PaymentStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderId } = await params;
  const { error } = await searchParams;
  const user = await requireUser(`/payment/status/${orderId}`);

  let order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== user.id) notFound();
  if (order.status === "PENDING") {
    await reconcileOrder(order.id);
    order = (await db.order.findUnique({ where: { id: orderId } }))!;
  }

  const latest = await db.payment.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
  const status = (
    order.status in VIEW ? order.status : "PENDING"
  ) as keyof typeof VIEW;
  const view = VIEW[status];
  const method = getPaymentMethod(order.paymentMethod);
  // Pending because the buyer never finished on the gateway page (vs. bank pending).
  const resumeUrl =
    status === "PENDING" && latest?.status === "CREATED"
      ? (JSON.parse(latest.meta) as { redirectUrl?: string }).redirectUrl
      : undefined;

  return (
    <Section containerClassName="max-w-xl" className="text-center">
      <p className="text-7xl">{view.emoji}</p>
      <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight">
        {view.title}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        {resumeUrl
          ? "You haven't finished paying yet. Pick up where you left off — the payment link expires 30 minutes after checkout."
          : view.body}
      </p>

      {typeof error === "string" && (
        <Notice variant="error" className="mx-auto mt-6 max-w-md">
          {error}
        </Notice>
      )}
      {order.failureReason && status !== "COMPLETED" && (
        <Notice variant="error" className="mx-auto mt-6 max-w-md">
          {order.failureReason}
        </Notice>
      )}

      <Card className="mt-8 text-left">
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Order</dt>
            <dd className="font-mono font-bold">{order.id}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="font-bold">{formatRupee(order.total)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Method</dt>
            <dd>
              {method ? `${method.emoji} ${method.label}` : order.paymentMethod}
            </dd>
          </div>
          {latest && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Payment ref</dt>
              <dd className="font-mono text-xs break-all">
                {latest.gatewayPaymentId}
              </dd>
            </div>
          )}
          {status === "COMPLETED" && order.cashback > 0 && (
            <div className="flex justify-between gap-4 text-primary">
              <dt className="font-bold">Gems earned 💎</dt>
              <dd className="font-bold">{formatGems(order.cashback)}</dd>
            </div>
          )}
        </dl>
      </Card>

      <div className="mt-8 flex flex-col items-center gap-4">
        {status === "COMPLETED" && (
          <Link
            href={`/orders/${order.id}`}
            className={buttonClasses({ size: "lg" })}
          >
            View voucher codes 🎟️
          </Link>
        )}

        {status === "PENDING" &&
          (resumeUrl ? (
            <Link href={resumeUrl} className={buttonClasses({ size: "lg" })}>
              Complete payment →
            </Link>
          ) : (
            <PaymentStatusPoller orderId={order.id} />
          ))}

        {(status === "FAILED" || status === "CANCELLED") && (
          <div className="flex flex-wrap justify-center gap-3">
            <form action={retryPaymentAction.bind(null, order.id)}>
              <SubmitButton size="lg" pendingLabel="Opening payment…">
                Retry {formatRupee(order.total)} →
              </SubmitButton>
            </form>
            <Link
              href="/checkout"
              className={buttonClasses({ size: "lg", variant: "outline" })}
            >
              Pay another way
            </Link>
          </div>
        )}

        <Link
          href="/orders"
          className="text-sm font-bold text-primary hover:underline"
        >
          All orders
        </Link>
      </div>
    </Section>
  );
}
