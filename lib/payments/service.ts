import type { Order, Payment } from "@prisma/client";
import { audit, type ActorType } from "../audit";
import { siteUrl } from "../config";
import { db, isUniqueViolation } from "../db";
import { sendTemplateEmail } from "../email/service";
import { UserFacingError } from "../errors";
import { recordLedgerEntry } from "../ledger";
import { log } from "../log";
import { transitionOrder, UNPAID_STATUSES } from "../orders/state";
import { recordIssue } from "../reconciliation/issues";
import { activeGateway, getGateway } from "./gateways";
import { requestRefund } from "./refunds";
import type { GatewayEvent, GatewayPaymentState } from "./types";

/*
 * PaymentService — what a gateway result MEANS for an order. Gateway
 * agnostic: it only sees GatewayPaymentState / GatewayEvent.
 *
 * Rules:
 *  - An order is funded only by a capture whose gateway id, merchant ref,
 *    amount and currency all match what we asked for. Anything else goes to
 *    MANUAL_REVIEW with a reconciliation issue — never to fulfilment.
 *  - The FIRST verified capture funds the order (Order.capturedPaymentId is
 *    unique). Any later capture for the same order is an extra capture: it
 *    is flagged and refunded, and NEVER causes a second fulfilment.
 *  - Capture + ledger + PAID transition happen in ONE transaction, so a
 *    crash can't leave "captured but not paid".
 *  - Everything is idempotent: return redirect, webhook (twice), status
 *    polls and reconciliation can all report the same capture.
 */

/** Outcome of applying a gateway state, for callers deciding what to kick off. */
export type PaymentOutcome =
  | "FUNDED"
  | "ALREADY_FUNDED"
  | "EXTRA_CAPTURE"
  | "MISMATCH"
  | "PENDING"
  | "FAILED"
  | "NO_CHANGE";

/** A payment attempt not finished at the gateway expires after this. */
export const PAYMENT_SESSION_TTL_MS = 30 * 60 * 1000;

interface Customer {
  name: string;
  email: string;
}

/**
 * Opens a payment attempt for an order. Our Payment row is written first
 * and its id is the gateway's idempotency key (merchantRef), so a retried
 * call can't create a second gateway payment.
 */
export async function createPaymentAttempt(
  order: Pick<Order, "id" | "totalPaise" | "currency">,
  customer: Customer,
): Promise<{ paymentId: string; redirectUrl: string }> {
  const gateway = activeGateway();
  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      gateway: gateway.code,
      gatewayPaymentId: `unassigned:${order.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      amountPaise: order.totalPaise,
      currency: order.currency,
    },
  });
  try {
    const created = await gateway.createPayment({
      merchantRef: payment.id,
      orderRef: order.id,
      amountPaise: order.totalPaise,
      currency: order.currency,
      customer,
      returnUrl: `${siteUrl()}/payment/return/${gateway.code}`,
    });
    await db.payment.update({
      where: { id: payment.id },
      data: {
        gatewayPaymentId: created.gatewayPaymentId,
        redirectUrl: created.redirectUrl,
      },
    });
    await audit({
      action: "PAYMENT_ATTEMPT_CREATED",
      entityType: "Payment",
      entityId: payment.id,
      orderId: order.id,
      data: {
        gateway: gateway.code,
        gatewayPaymentId: created.gatewayPaymentId,
        amountPaise: order.totalPaise,
      },
    });
    return { paymentId: payment.id, redirectUrl: created.redirectUrl };
  } catch (error) {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: "Payment gateway unavailable." },
    });
    log.error("payment.create_failed", {
      orderId: order.id,
      paymentId: payment.id,
      error,
    });
    throw new UserFacingError(
      "The payment service is unavailable right now. Please try again shortly.",
      "GATEWAY_DOWN",
    );
  }
}

/** New attempt for an order whose payment failed / was cancelled. */
export async function retryOrderPayment(
  userId: string,
  orderId: string,
  customer: Customer,
): Promise<string> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!order || order.userId !== userId)
    throw new UserFacingError("Order not found.", "NOT_FOUND");
  const latest = order.payments[0];
  if (
    order.status === "PAYMENT_PENDING" &&
    latest?.status === "CREATED" &&
    latest.redirectUrl
  ) {
    return latest.redirectUrl; // resume the open attempt
  }
  if (order.status !== "PAYMENT_FAILED" && order.status !== "CANCELLED") {
    throw new UserFacingError(
      "This order isn't waiting for a payment.",
      "NOT_RETRYABLE",
    );
  }
  if (latest && (latest.status === "PENDING" || latest.status === "CREATED")) {
    throw new UserFacingError(
      "A payment for this order is still being processed.",
      "PAYMENT_IN_FLIGHT",
    );
  }
  const reopened = await transitionOrder(db, {
    orderId,
    from: order.status,
    to: "PAYMENT_PENDING",
    reason: "Customer retried payment",
    actor: { type: "CUSTOMER", id: userId },
  });
  if (!reopened)
    throw new UserFacingError(
      "This order was just updated — please refresh.",
      "CONFLICT",
    );
  const { redirectUrl } = await createPaymentAttempt(order, customer);
  return redirectUrl;
}

/**
 * Handles a verified gateway webhook. Each gateway event id is processed
 * once; a replay returns early without side effects.
 */
export async function handleGatewayEvent(
  gatewayCode: string,
  event: GatewayEvent,
): Promise<{ duplicate: boolean; outcome?: PaymentOutcome; orderId?: string }> {
  let record;
  try {
    record = await db.paymentEvent.create({
      data: {
        gateway: gatewayCode,
        externalEventId: event.externalEventId,
        eventType: event.eventType,
        payload: event.sanitizedPayload as object,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await db.paymentEvent.findUnique({
      where: {
        gateway_externalEventId: {
          gateway: gatewayCode,
          externalEventId: event.externalEventId,
        },
      },
    });
    if (
      existing &&
      existing.status !== "FAILED" &&
      existing.status !== "RECEIVED"
    ) {
      log.info("payment.webhook_duplicate", { eventType: event.eventType });
      return { duplicate: true };
    }
    record = existing!; // previous processing crashed — safe to re-apply
  }

  const payment = await db.payment.findUnique({
    where: { gatewayPaymentId: event.payment.gatewayPaymentId },
  });
  if (!payment) {
    await db.paymentEvent.update({
      where: { id: record.id },
      data: {
        status: "IGNORED",
        processedAt: new Date(),
        error: "Unknown payment",
      },
    });
    return { duplicate: false };
  }

  try {
    const outcome = await applyGatewayState(
      payment.id,
      event.payment,
      "GATEWAY",
    );
    await db.paymentEvent.update({
      where: { id: record.id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        paymentId: payment.id,
      },
    });
    return { duplicate: false, outcome, orderId: payment.orderId };
  } catch (error) {
    await db.paymentEvent.update({
      where: { id: record.id },
      data: {
        status: "FAILED",
        paymentId: payment.id,
        error: error instanceof Error ? error.message : "error",
      },
    });
    throw error;
  }
}

/** Asks the gateway for a payment's current state and applies it. */
export async function refreshPayment(
  paymentId: string,
  actor: ActorType = "SYSTEM",
): Promise<PaymentOutcome> {
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
  });
  if (payment.gatewayPaymentId.startsWith("unassigned:")) return "NO_CHANGE";
  const state = await getGateway(payment.gateway).getPaymentStatus(
    payment.gatewayPaymentId,
  );
  return applyGatewayState(payment.id, state, actor);
}

/**
 * Applies what the gateway says about one payment. The single entry point
 * for return redirects, webhooks, polls and reconciliation.
 */
export async function applyGatewayState(
  paymentId: string,
  state: GatewayPaymentState,
  actor: ActorType,
): Promise<PaymentOutcome> {
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { order: true },
  });
  const order = payment.order;

  // Identity: the gateway must be talking about THIS payment.
  if (
    state.gatewayPaymentId !== payment.gatewayPaymentId ||
    state.merchantRef !== payment.id
  ) {
    await recordIssue({
      type: "PAYMENT_IDENTITY_MISMATCH",
      severity: "CRITICAL",
      dedupeKey: `PAYMENT_IDENTITY_MISMATCH:${payment.id}`,
      orderId: order.id,
      paymentId: payment.id,
      details: {
        reportedGatewayPaymentId: state.gatewayPaymentId,
        reportedMerchantRef: state.merchantRef,
      },
    });
    return "MISMATCH";
  }

  switch (state.status) {
    case "SUCCEEDED":
      return applyCapture(payment, order, state, actor);
    case "PENDING": {
      await db.payment.updateMany({
        where: { id: payment.id, status: "CREATED" },
        data: { status: "PENDING" },
      });
      return "PENDING";
    }
    case "FAILED":
    case "CANCELLED":
      return applyFailure(payment, order, state);
    default:
      return "NO_CHANGE";
  }
}

async function applyCapture(
  payment: Payment,
  order: Order,
  state: GatewayPaymentState,
  actor: ActorType,
): Promise<PaymentOutcome> {
  const amountOk = state.amountPaise === payment.amountPaise;
  const currencyOk = state.currency === payment.currency;

  const result = await db.$transaction(async (tx) => {
    // Money moved either way, so the capture is recorded at what was taken.
    const marked = await tx.payment.updateMany({
      where: { id: payment.id, status: { notIn: ["SUCCEEDED", "REFUNDED"] } },
      data: {
        status: "SUCCEEDED",
        capturedAt: new Date(),
        failureReason:
          amountOk && currencyOk ? null : "AMOUNT_OR_CURRENCY_MISMATCH",
      },
    });
    await recordLedgerEntry(
      {
        orderId: order.id,
        paymentId: payment.id,
        type: "PAYMENT_CAPTURED",
        amountPaise: state.amountPaise,
        currency: state.currency,
        dedupeKey: `capture:${payment.id}`,
        externalRef: payment.gatewayPaymentId,
      },
      tx,
    );

    const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id } });

    if (!amountOk || !currencyOk) {
      await recordIssue(
        {
          type: amountOk
            ? "PAYMENT_CURRENCY_MISMATCH"
            : "PAYMENT_AMOUNT_MISMATCH",
          severity: "CRITICAL",
          dedupeKey: `${amountOk ? "PAYMENT_CURRENCY_MISMATCH" : "PAYMENT_AMOUNT_MISMATCH"}:${payment.id}`,
          orderId: order.id,
          paymentId: payment.id,
          details: {
            expectedPaise: payment.amountPaise,
            reportedPaise: state.amountPaise,
            expectedCurrency: payment.currency,
            reportedCurrency: state.currency,
          },
        },
        tx,
      );
      await audit(
        {
          action: "PAYMENT_MISMATCH",
          entityType: "Payment",
          entityId: payment.id,
          orderId: order.id,
          actorType: actor,
          data: {
            expectedPaise: payment.amountPaise,
            reportedPaise: state.amountPaise,
            currency: state.currency,
          },
        },
        tx,
      );
      if (UNPAID_STATUSES.includes(fresh.status)) {
        await transitionOrder(tx, {
          orderId: order.id,
          from: fresh.status,
          to: "MANUAL_REVIEW",
          reason: "Captured amount/currency does not match the order",
          actor: { type: actor },
        });
      }
      return "MISMATCH" as const;
    }

    if (fresh.capturedPaymentId === payment.id)
      return "ALREADY_FUNDED" as const;

    if (
      fresh.capturedPaymentId === null &&
      UNPAID_STATUSES.includes(fresh.status)
    ) {
      const funded = await transitionOrder(tx, {
        orderId: order.id,
        from: fresh.status,
        to: "PAID",
        reason: "Payment verified",
        actor: { type: actor },
        set: { capturedPaymentId: payment.id },
      });
      if (funded) {
        await audit(
          {
            action: "PAYMENT_VERIFIED",
            entityType: "Payment",
            entityId: payment.id,
            orderId: order.id,
            actorType: actor,
            data: {
              amountPaise: state.amountPaise,
              currency: state.currency,
              newlyCaptured: marked.count === 1,
            },
          },
          tx,
        );
        return "FUNDED" as const;
      }
    }

    // Another payment already funded this order: this one is extra money.
    await tx.payment.update({
      where: { id: payment.id },
      data: { isExtraCapture: true },
    });
    await recordIssue(
      {
        type: "DOUBLE_CAPTURE",
        severity: "HIGH",
        dedupeKey: `DOUBLE_CAPTURE:${payment.id}`,
        orderId: order.id,
        paymentId: payment.id,
        details: {
          fundedBy: fresh.capturedPaymentId,
          amountPaise: state.amountPaise,
        },
      },
      tx,
    );
    await audit(
      {
        action: "EXTRA_CAPTURE_DETECTED",
        entityType: "Payment",
        entityId: payment.id,
        orderId: order.id,
        actorType: actor,
        data: {
          fundedBy: fresh.capturedPaymentId,
          amountPaise: state.amountPaise,
        },
      },
      tx,
    );
    return "EXTRA_CAPTURE" as const;
  });

  if (result === "FUNDED") {
    // The buyer has paid: those lines leave the cart (anything added since stays).
    const items = await db.orderItem.findMany({
      where: { orderId: order.id },
      select: { productId: true },
    });
    await db.cartItem.deleteMany({
      where: {
        userId: order.userId,
        productId: { in: items.map((i) => i.productId) },
      },
    });
    const user = await db.user.findUnique({ where: { id: order.userId } });
    if (user) {
      await sendTemplateEmail("PAYMENT_RECEIVED", user.email, {
        name: user.name,
        orderId: order.id,
        amountPaise: state.amountPaise,
      });
    }
  } else if (result === "EXTRA_CAPTURE") {
    // Refund outside the transaction (it's a remote call). Idempotent key:
    // the refund can't be issued twice for this payment.
    await requestRefund({
      orderId: order.id,
      paymentId: payment.id,
      amountPaise: state.amountPaise,
      reason: "Duplicate payment — order was already paid",
      idempotencyKey: `extra-capture:${payment.id}`,
      actor: { type: "SYSTEM" },
    });
  }
  return result;
}

async function applyFailure(
  payment: Payment,
  order: Order,
  state: GatewayPaymentState,
): Promise<PaymentOutcome> {
  const status = state.status === "CANCELLED" ? "CANCELLED" : "FAILED";
  const { count } = await db.payment.updateMany({
    where: { id: payment.id, status: { in: ["CREATED", "PENDING"] } },
    data: { status, failureReason: state.failureReason ?? null },
  });
  if (count === 0) return "NO_CHANGE";

  // Only the latest attempt decides the order's fate — an old attempt
  // failing late mustn't knock over a retry in flight.
  const latest = await db.payment.findFirst({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
  });
  if (latest?.id === payment.id) {
    await transitionOrder(db, {
      orderId: order.id,
      from: "PAYMENT_PENDING",
      to: status === "CANCELLED" ? "CANCELLED" : "PAYMENT_FAILED",
      reason:
        state.failureReason ??
        (status === "CANCELLED" ? "Payment cancelled" : "Payment failed"),
      actor: { type: "GATEWAY" },
    });
  }
  return "FAILED";
}

/**
 * Cron: brings open payments up to date (missed webhooks, pending banks,
 * late captures) and expires sessions the buyer abandoned.
 */
export async function pollPayments(
  limit = 25,
): Promise<{ checked: number; expired: number }> {
  const now = Date.now();
  const candidates = await db.payment.findMany({
    where: {
      gatewayPaymentId: { not: { startsWith: "unassigned:" } },
      OR: [
        {
          status: { in: ["CREATED", "PENDING"] },
          updatedAt: { lt: new Date(now - 15_000) },
        },
        // Late captures after a reported failure (some banks do this).
        {
          status: { in: ["FAILED", "CANCELLED"] },
          createdAt: { gt: new Date(now - 2 * 60 * 60 * 1000) },
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  let expired = 0;
  for (const payment of candidates) {
    try {
      await refreshPayment(payment.id, "CRON");
      const fresh = await db.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      if (
        fresh.status === "CREATED" &&
        now - fresh.createdAt.getTime() > PAYMENT_SESSION_TTL_MS
      ) {
        await applyFailure(
          fresh,
          await db.order.findUniqueOrThrow({ where: { id: fresh.orderId } }),
          {
            gatewayPaymentId: fresh.gatewayPaymentId,
            merchantRef: fresh.id,
            status: "CANCELLED",
            amountPaise: fresh.amountPaise,
            currency: fresh.currency,
            failureReason: "Payment session expired before it was completed.",
          },
        );
        expired++;
      }
    } catch (error) {
      log.error("payment.poll_failed", { paymentId: payment.id, error });
    }
  }
  return { checked: candidates.length, expired };
}
