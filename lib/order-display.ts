import type { OrderStatus } from "@prisma/client";

/*
 * Customer-facing wording for order states. Never exposes internal
 * details (provider names, error codes, review reasons).
 */
export interface StatusCopy {
  label: string;
  headline: string;
  body: string;
  tone: "progress" | "success" | "warning" | "neutral";
}

export const ORDER_STATUS_COPY: Record<OrderStatus, StatusCopy> = {
  PAYMENT_PENDING: {
    label: "Waiting for payment",
    headline: "Waiting for payment",
    body: "We haven't received confirmation of your payment yet. If you've paid, this page updates automatically.",
    tone: "progress",
  },
  PAYMENT_FAILED: {
    label: "Payment unsuccessful",
    headline: "Payment was unsuccessful",
    body: "No gift card was issued. If any amount was debited, your bank reverses it automatically. You can try again.",
    tone: "warning",
  },
  CANCELLED: {
    label: "Cancelled",
    headline: "Payment cancelled",
    body: "The payment wasn't completed, so nothing was charged. You can try again whenever you like.",
    tone: "neutral",
  },
  PAID: {
    label: "Preparing gift card",
    headline: "Payment received",
    body: "Payment received. Preparing your gift card — this usually takes a few seconds.",
    tone: "progress",
  },
  FULFILLING: {
    label: "Preparing gift card",
    headline: "Preparing your gift card",
    body: "Preparing your gift card. This page updates automatically.",
    tone: "progress",
  },
  FULFILMENT_PENDING: {
    label: "Preparing gift card",
    headline: "Payment received. Preparing your gift card.",
    body: "This is taking a little longer than usual. Your payment is safe and there's nothing you need to do — we'll email you when it's ready.",
    tone: "progress",
  },
  FULFILLED: {
    label: "Ready",
    headline: "Your gift card is ready",
    body: "Reveal the code on your order page when you're ready to use it.",
    tone: "success",
  },
  FULFILMENT_FAILED: {
    label: "Refund in progress",
    headline: "We couldn't complete your order",
    body: "We couldn't complete your gift card order. Your refund is being processed.",
    tone: "warning",
  },
  REFUND_PENDING: {
    label: "Refund in progress",
    headline: "We couldn't complete your order",
    body: "We couldn't complete your gift card order. Your refund is being processed.",
    tone: "warning",
  },
  REFUNDED: {
    label: "Refunded",
    headline: "Your payment has been refunded",
    body: "Your payment has been refunded to the original payment method. Banks usually take 5–7 working days to show it.",
    tone: "neutral",
  },
  MANUAL_REVIEW: {
    label: "Being checked",
    headline: "We're checking your order",
    body: "We're checking your order. No action is required from you right now — we'll email you as soon as it's resolved.",
    tone: "progress",
  },
};

/** States where the status page should keep polling. */
export const IN_PROGRESS: readonly OrderStatus[] = [
  "PAYMENT_PENDING",
  "PAID",
  "FULFILLING",
  "FULFILMENT_PENDING",
];
