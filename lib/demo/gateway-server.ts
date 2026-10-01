import { randomBytes } from "node:crypto";
import { hmacSha256 } from "../crypto";
import { paymentWebhookSecret, siteUrl } from "../config";
import { db } from "../db";
import { log } from "../log";

/*
 * ─── SIMULATED EXTERNAL SYSTEM ──────────────────────────────────────────
 * This file plays the role of a third-party payment gateway's servers
 * ("DemoPay"). It keeps its OWN state (DemoGateway* tables), signs its
 * webhooks and return redirects with the shared secret, and is only ever
 * talked to through the DemoPaymentGateway adapter
 * (lib/payments/gateways/demo.ts) — exactly as a real gateway would be
 * talked to over HTTPS. Business logic never imports this file.
 */

export type DemoPaymentScenario =
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "PENDING_SUCCESS"
  | "PENDING_FAILURE"
  | "DUPLICATE_WEBHOOK"
  | "WRONG_AMOUNT"
  | "DELAYED_SUCCESS"
  | "DOUBLE_CAPTURE";

export const DEMO_PAYMENT_SCENARIOS: {
  id: DemoPaymentScenario;
  label: string;
  note: string;
}[] = [
  {
    id: "SUCCESS",
    label: "Payment succeeds",
    note: "Bank approves instantly; webhook + return.",
  },
  {
    id: "FAILED",
    label: "Payment fails",
    note: "Bank declines; no money taken.",
  },
  {
    id: "CANCELLED",
    label: "Customer cancels",
    note: "Backs out on the payment page.",
  },
  {
    id: "PENDING_SUCCESS",
    label: "Pending → succeeds",
    note: "Bank confirms after ~20s (status polling picks it up).",
  },
  {
    id: "PENDING_FAILURE",
    label: "Pending → fails",
    note: "Bank gives up after ~20s.",
  },
  {
    id: "DUPLICATE_WEBHOOK",
    label: "Duplicate webhook",
    note: "Succeeds; the gateway sends the same event twice.",
  },
  {
    id: "WRONG_AMOUNT",
    label: "Wrong amount captured",
    note: "Gateway captures ₹1 less — must NOT fulfil.",
  },
  {
    id: "DELAYED_SUCCESS",
    label: "Late success",
    note: "Reported failed, then captured ~20s later (no webhook).",
  },
  {
    id: "DOUBLE_CAPTURE",
    label: "Double capture",
    note: "Attempt 1 'fails', customer retries and pays, then attempt 1 captures too.",
  },
];

export const DEMO_PENDING_MS = 20_000;
const WEBHOOK_SIG_HEADER = "x-demo-signature";

function id(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export interface DemoGatewayView {
  gatewayPaymentId: string;
  merchantRef: string;
  orderRef: string;
  amountPaise: number;
  capturedPaise: number | null;
  currency: string;
  status: string;
  failureReason: string | null;
  returnUrl: string;
  scenario: string | null;
}

// ─── API surface used by the adapter (≈ the gateway's REST API) ─────────

export async function apiCreatePayment(input: {
  merchantRef: string;
  orderRef: string;
  amountPaise: number;
  currency: string;
  returnUrl: string;
}): Promise<{ gatewayPaymentId: string; redirectUrl: string }> {
  // Idempotent on merchantRef, like real gateways' receipt/merchant ids.
  const existing = await db.demoGatewayPayment.findUnique({
    where: { merchantRef: input.merchantRef },
  });
  const payment =
    existing ??
    (await db.demoGatewayPayment.create({
      data: { gatewayPaymentId: id("dpay"), ...input },
    }));
  return {
    gatewayPaymentId: payment.gatewayPaymentId,
    redirectUrl: `${siteUrl()}/pay/demo/${payment.gatewayPaymentId}`,
  };
}

/** Current state, settling any delayed outcome that has come due. */
export async function apiGetPayment(
  gatewayPaymentId: string,
): Promise<DemoGatewayView | null> {
  let payment = await db.demoGatewayPayment.findUnique({
    where: { gatewayPaymentId },
  });
  if (!payment) return null;
  if (payment.settleAt && payment.settleTo && payment.settleAt <= new Date()) {
    const settled = await db.demoGatewayPayment.updateMany({
      where: { gatewayPaymentId, settleAt: payment.settleAt },
      data: {
        status: payment.settleTo,
        capturedPaise:
          payment.settleTo === "SUCCEEDED"
            ? payment.amountPaise
            : payment.capturedPaise,
        failureReason:
          payment.settleTo === "FAILED"
            ? "Bank did not confirm the payment (simulated)."
            : null,
        settleAt: null,
        settleTo: null,
      },
    });
    if (settled.count === 1)
      payment = (await db.demoGatewayPayment.findUnique({
        where: { gatewayPaymentId },
      }))!;
  }
  return payment;
}

export async function apiRefund(input: {
  gatewayPaymentId: string;
  amountPaise: number;
  idempotencyKey: string;
}): Promise<{
  status: "SUCCEEDED" | "FAILED";
  gatewayRefundId: string;
  failureReason?: string;
}> {
  const prior = await db.demoGatewayRefund.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (prior && prior.status === "SUCCEEDED") {
    return { status: "SUCCEEDED", gatewayRefundId: prior.gatewayRefundId };
  }

  const control = await db.demoControl.findUnique({ where: { id: "default" } });
  const payment = await db.demoGatewayPayment.findUnique({
    where: { gatewayPaymentId: input.gatewayPaymentId },
  });
  let failureReason: string | undefined;
  if (control?.refundFailNext) {
    await db.demoControl.update({
      where: { id: "default" },
      data: { refundFailNext: false },
    });
    failureReason = "Refund rejected by bank (simulated).";
  } else if (!payment || payment.status !== "SUCCEEDED") {
    failureReason = "Payment is not captured.";
  } else if (
    (payment.capturedPaise ?? 0) - payment.refundedPaise <
    input.amountPaise
  ) {
    failureReason = "Refund exceeds captured amount.";
  }

  if (failureReason) {
    if (!prior) {
      await db.demoGatewayRefund.create({
        data: {
          gatewayRefundId: id("drfd"),
          gatewayPaymentId: input.gatewayPaymentId,
          idempotencyKey: input.idempotencyKey,
          amountPaise: input.amountPaise,
          status: "FAILED",
          failureReason,
        },
      });
    }
    return {
      status: "FAILED",
      gatewayRefundId: prior?.gatewayRefundId ?? "",
      failureReason,
    };
  }

  const gatewayRefundId = prior?.gatewayRefundId ?? id("drfd");
  await db.$transaction([
    prior
      ? db.demoGatewayRefund.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: { status: "SUCCEEDED", failureReason: null },
        })
      : db.demoGatewayRefund.create({
          data: {
            gatewayRefundId,
            gatewayPaymentId: input.gatewayPaymentId,
            idempotencyKey: input.idempotencyKey,
            amountPaise: input.amountPaise,
            status: "SUCCEEDED",
          },
        }),
    db.demoGatewayPayment.update({
      where: { gatewayPaymentId: input.gatewayPaymentId },
      data: { refundedPaise: { increment: input.amountPaise } },
    }),
  ]);
  return { status: "SUCCEEDED", gatewayRefundId };
}

export async function apiGetRefund(gatewayRefundId: string) {
  return db.demoGatewayRefund.findUnique({ where: { gatewayRefundId } });
}

// ─── Signing (shared secret, like a real gateway's webhook secret) ──────

export function signWebhook(
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  return `t=${timestamp},v1=${hmacSha256(paymentWebhookSecret(), `${timestamp}.${rawBody}`)}`;
}

export function signReturn(
  gatewayPaymentId: string,
  timestamp: number,
): string {
  return hmacSha256(
    paymentWebhookSecret(),
    `return|${gatewayPaymentId}|${timestamp}`,
  );
}

export const DEMO_WEBHOOK_SIGNATURE_HEADER = WEBHOOK_SIG_HEADER;

// ─── Hosted payment page behaviour (≈ the gateway's checkout UI) ────────

function webhookBody(p: DemoGatewayView, eventId = id("devt")) {
  return JSON.stringify({
    id: eventId,
    type: `payment.${p.status.toLowerCase()}`,
    created: Math.floor(Date.now() / 1000),
    data: {
      payment_id: p.gatewayPaymentId,
      merchant_ref: p.merchantRef,
      order_ref: p.orderRef,
      status: p.status,
      amount:
        p.status === "SUCCEEDED"
          ? (p.capturedPaise ?? p.amountPaise)
          : p.amountPaise,
      currency: p.currency,
      failure_reason: p.failureReason,
    },
  });
}

/**
 * Sends a signed webhook to the merchant. Delivered in-process through the
 * exact same verification + handling path as the HTTP webhook route (an
 * HTTP self-call would be blocked by Vercel deployment protection).
 */
export async function emitWebhook(
  gatewayPaymentId: string,
  times = 1,
): Promise<void> {
  const payment = await apiGetPayment(gatewayPaymentId);
  if (!payment) return;
  const body = webhookBody(payment);
  const { receiveWebhook } = await import("../payments/webhooks");
  for (let i = 0; i < times; i++) {
    const headers = new Headers({
      [WEBHOOK_SIG_HEADER]: signWebhook(body),
      "content-type": "application/json",
    });
    const result = await receiveWebhook("demo", body, headers);
    log.info("demo_gateway.webhook_delivered", {
      status: String(result.status),
      eventType: payment.status,
    });
  }
}

/** Buyer's signed redirect back to the merchant. */
export function returnRedirect(payment: {
  gatewayPaymentId: string;
  returnUrl: string;
}): string {
  const ts = Math.floor(Date.now() / 1000);
  const url = new URL(payment.returnUrl);
  url.searchParams.set("payment_id", payment.gatewayPaymentId);
  url.searchParams.set("ts", String(ts));
  url.searchParams.set("sig", signReturn(payment.gatewayPaymentId, ts));
  return url.toString();
}

/** Sets the payment's outcome on the gateway side (no webhook). */
export async function settle(
  gatewayPaymentId: string,
  status: "SUCCEEDED" | "FAILED" | "CANCELLED" | "PENDING",
  opts: {
    capturedPaise?: number;
    failureReason?: string;
    settleAt?: Date;
    settleTo?: string;
    scenario?: string;
  } = {},
) {
  const payment = await db.demoGatewayPayment.findUniqueOrThrow({
    where: { gatewayPaymentId },
  });
  await db.demoGatewayPayment.update({
    where: { gatewayPaymentId },
    data: {
      status,
      scenario: opts.scenario ?? payment.scenario,
      capturedPaise:
        status === "SUCCEEDED"
          ? (opts.capturedPaise ?? payment.amountPaise)
          : null,
      failureReason: opts.failureReason ?? null,
      settleAt: opts.settleAt ?? null,
      settleTo: opts.settleTo ?? null,
    },
  });
}
