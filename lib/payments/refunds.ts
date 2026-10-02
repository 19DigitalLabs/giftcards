import { audit, type ActorType } from "../audit";
import { db, isUniqueViolation } from "../db";
import { notifyCustomer } from "../notifications";
import { UserFacingError } from "../errors";
import { recordLedgerEntry } from "../ledger";
import { log } from "../log";
import { transitionOrder } from "../orders/state";
import { recordIssue } from "../reconciliation/issues";
import { getGateway } from "./gateways";

/*
 * Refunds. A refund is REFUNDED only when the gateway confirms it; until
 * then it stays PENDING (retried by cron). Each refund carries our
 * idempotency key to the gateway, so retries can never refund twice.
 */

/** Gateway rejected / errored this many times → humans take over. */
const MAX_REFUND_ATTEMPTS = 3;

export interface RefundRequest {
  orderId: string;
  paymentId: string;
  amountPaise: number;
  reason: string;
  idempotencyKey: string;
  actor: { type: ActorType; id?: string | null };
}

/** Creates (or finds) the refund for this key and executes it. */
export async function requestRefund(req: RefundRequest) {
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: req.paymentId },
  });
  let refund;
  try {
    refund = await db.refund.create({
      data: {
        orderId: req.orderId,
        paymentId: req.paymentId,
        amountPaise: req.amountPaise,
        currency: payment.currency,
        reason: req.reason,
        idempotencyKey: req.idempotencyKey,
      },
    });
    await audit({
      action: "REFUND_STARTED",
      entityType: "Refund",
      entityId: refund.id,
      orderId: req.orderId,
      actorType: req.actor.type,
      actorId: req.actor.id,
      data: {
        paymentId: req.paymentId,
        amountPaise: req.amountPaise,
        reason: req.reason,
      },
    });
    const order = await db.order.findUniqueOrThrow({
      where: { id: req.orderId },
      include: { user: true },
    });
    await notifyCustomer("REFUND_INITIATED", order.user, {
      name: order.user.name,
      orderId: order.id,
      amountPaise: req.amountPaise,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    refund = await db.refund.findUniqueOrThrow({
      where: { idempotencyKey: req.idempotencyKey },
    });
  }
  await executeRefund(refund.id);
  return db.refund.findUniqueOrThrow({ where: { id: refund.id } });
}

/** Calls the gateway for a PENDING refund and records the result. */
export async function executeRefund(refundId: string): Promise<void> {
  const refund = await db.refund.findUniqueOrThrow({
    where: { id: refundId },
    include: { payment: true },
  });
  if (refund.status !== "PENDING") return;
  const gateway = getGateway(refund.payment.gateway);

  // Claim this execution (attempts++) so concurrent cron runs don't both call.
  const claimed = await db.refund.updateMany({
    where: { id: refund.id, status: "PENDING", attempts: refund.attempts },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;

  let result;
  try {
    result = refund.gatewayRefundId
      ? await gateway.getRefundStatus(refund.gatewayRefundId)
      : await gateway.refund({
          gatewayPaymentId: refund.payment.gatewayPaymentId,
          amountPaise: refund.amountPaise,
          currency: refund.currency,
          idempotencyKey: refund.idempotencyKey,
          reason: refund.reason,
        });
  } catch (error) {
    log.error("refund.gateway_error", {
      orderId: refund.orderId,
      paymentId: refund.paymentId,
      error,
    });
    if (refund.attempts + 1 >= MAX_REFUND_ATTEMPTS)
      await failRefund(refund.id, "Gateway unreachable after retries");
    return;
  }

  if (result.status === "SUCCEEDED") {
    await completeRefund(refund.id, result.gatewayRefundId ?? null);
  } else if (result.status === "PENDING") {
    await db.refund.update({
      where: { id: refund.id },
      data: { gatewayRefundId: result.gatewayRefundId },
    });
  } else {
    await failRefund(
      refund.id,
      result.failureReason ?? "Refund rejected by the gateway",
    );
  }
}

async function completeRefund(
  refundId: string,
  gatewayRefundId: string | null,
) {
  const refund = await db.refund.findUniqueOrThrow({
    where: { id: refundId },
    include: { order: true },
  });
  const done = await db.$transaction(async (tx) => {
    const { count } = await tx.refund.updateMany({
      where: { id: refundId, status: "PENDING" },
      data: {
        status: "SUCCEEDED",
        gatewayRefundId,
        completedAt: new Date(),
        failureReason: null,
      },
    });
    if (count === 0) return false;
    await recordLedgerEntry(
      {
        orderId: refund.orderId,
        paymentId: refund.paymentId,
        refundId: refund.id,
        type: "PAYMENT_REFUNDED",
        amountPaise: refund.amountPaise,
        currency: refund.currency,
        dedupeKey: `refund:${refund.id}`,
        externalRef: gatewayRefundId ?? undefined,
      },
      tx,
    );
    const refunded = await tx.refund.aggregate({
      _sum: { amountPaise: true },
      where: { paymentId: refund.paymentId, status: "SUCCEEDED" },
    });
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: refund.paymentId },
    });
    if ((refunded._sum.amountPaise ?? 0) >= payment.amountPaise) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "REFUNDED" },
      });
    }
    // The order's own refund (not an extra capture) closes the order.
    if (refund.order.capturedPaymentId === refund.paymentId) {
      await transitionOrder(tx, {
        orderId: refund.orderId,
        from: "REFUND_PENDING",
        to: "REFUNDED",
        reason: "Refund confirmed by gateway",
      });
    }
    await audit(
      {
        action: "REFUND_COMPLETED",
        entityType: "Refund",
        entityId: refund.id,
        orderId: refund.orderId,
        actorType: "GATEWAY",
        data: { amountPaise: refund.amountPaise, gatewayRefundId },
      },
      tx,
    );
    return true;
  });
  if (done) {
    const user = await db.user.findUnique({
      where: { id: refund.order.userId },
    });
    if (user) {
      await notifyCustomer("REFUND_COMPLETED", user, {
        name: user.name,
        orderId: refund.orderId,
        amountPaise: refund.amountPaise,
      });
    }
  }
}

async function failRefund(refundId: string, reason: string) {
  const refund = await db.refund.findUniqueOrThrow({
    where: { id: refundId },
    include: { order: true },
  });
  await db.refund.update({
    where: { id: refundId },
    data: { status: "FAILED", failureReason: reason },
  });
  await audit({
    action: "REFUND_FAILED",
    entityType: "Refund",
    entityId: refundId,
    orderId: refund.orderId,
    actorType: "GATEWAY",
    data: { reason },
  });
  await recordIssue({
    type: "REFUND_FAILED",
    severity: "HIGH",
    dedupeKey: `REFUND_FAILED:${refundId}`,
    orderId: refund.orderId,
    paymentId: refund.paymentId,
    details: { reason, amountPaise: refund.amountPaise },
  });
  if (refund.order.capturedPaymentId === refund.paymentId) {
    await transitionOrder(db, {
      orderId: refund.orderId,
      from: "REFUND_PENDING",
      to: "MANUAL_REVIEW",
      reason: `Refund failed: ${reason}`,
    });
  }
}

/**
 * Starts the full refund of an order that can't be fulfilled. Only allowed
 * when the money is with us and NO voucher was issued — a refund after
 * issue needs the provider to cancel the voucher first (manual).
 */
export async function startOrderRefund(
  orderId: string,
  reason: string,
  actor: { type: ActorType; id?: string | null },
) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      refunds: true,
      items: { include: { vouchers: { where: { status: "ACTIVE" } } } },
    },
  });
  if (
    order.status !== "FULFILMENT_FAILED" &&
    order.status !== "MANUAL_REVIEW"
  ) {
    throw new UserFacingError(
      `Order is ${order.status}; refunds start from FULFILMENT_FAILED or MANUAL_REVIEW.`,
      "NOT_REFUNDABLE",
    );
  }
  if (!order.capturedPaymentId)
    throw new UserFacingError(
      "Order has no captured payment.",
      "NOT_REFUNDABLE",
    );
  if (order.items.some((i) => i.vouchers.length > 0)) {
    throw new UserFacingError(
      "Vouchers were issued for this order — cancel them with the provider first.",
      "VOUCHERS_ISSUED",
    );
  }
  const orderRefunds = order.refunds.filter(
    (r) => r.paymentId === order.capturedPaymentId,
  );
  if (
    orderRefunds.some((r) => r.status === "PENDING" || r.status === "SUCCEEDED")
  ) {
    throw new UserFacingError(
      "A refund is already in progress or done.",
      "ALREADY_REFUNDING",
    );
  }

  const moved = await transitionOrder(db, {
    orderId,
    from: order.status,
    to: "REFUND_PENDING",
    reason,
    actor,
  });
  if (!moved)
    throw new UserFacingError(
      "Order changed — refresh and try again.",
      "CONFLICT",
    );

  const payment = await db.payment.findUniqueOrThrow({
    where: { id: order.capturedPaymentId },
  });
  return requestRefund({
    orderId,
    paymentId: payment.id,
    amountPaise: payment.amountPaise,
    reason,
    idempotencyKey: `order-refund:${orderId}:${orderRefunds.length + 1}`,
    actor,
  });
}

/** Cron: retries PENDING refunds. */
export async function processPendingRefunds(limit = 10): Promise<number> {
  const pending = await db.refund.findMany({
    where: {
      status: "PENDING",
      updatedAt: { lt: new Date(Date.now() - 10_000) },
    },
    take: limit,
    orderBy: { updatedAt: "asc" },
  });
  for (const refund of pending) await executeRefund(refund.id);
  return pending.length;
}
