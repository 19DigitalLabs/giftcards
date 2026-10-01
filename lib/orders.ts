import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "./crypto";
import { db } from "./db";
import { getGateway, getGatewayById, type GatewayUpdate } from "./gateway";
import { sendEmail } from "./mailer";
import { convenienceFee, getPaymentMethod, methodCashback } from "./payments";
import { requestOrigin } from "./request";
import { formatRupee } from "./utils";

/*
 * Order lifecycle:
 *
 *   PENDING ──gateway SUCCESS──▶ COMPLETED  (codes issued, cart lines cleared)
 *      │ └──gateway FAILED/CANCELLED / session expired──▶ FAILED | CANCELLED
 *      ◀──────────── retry payment (new Payment attempt) ──────┘
 *
 * The cart is only cleared on success, so a failed payment loses nothing.
 * Every gateway update funnels through applyGatewayUpdate, which is
 * idempotent: the return redirect, the webhook and status polls can all
 * report the same success and the order is fulfilled exactly once.
 */

export type OrderStatus = "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";

/** Most face value one order can carry (fraud/risk control). */
export const MAX_ORDER_VALUE = 25_000;
/** Most face value one buyer can purchase in a rolling 24 hours. */
export const DAILY_PURCHASE_LIMIT = 50_000;
/** A payment the buyer never completes at the gateway expires after this. */
export const PAYMENT_SESSION_TTL_MS = 30 * 60 * 1000;

/** A checkout problem worth showing the buyer verbatim. */
export class CheckoutError extends Error {}

interface Buyer {
  id: string;
  name: string;
  email: string;
}

function newOrderId(): string {
  return `GC-${randomBytes(5).toString("hex").toUpperCase()}`;
}

/** A voucher code, e.g. "MYNT-8F2A-C41D-90BE". Dummy until a supplier API issues real ones. */
function voucherCode(brandName: string): string {
  const prefix = brandName
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 4)
    .toUpperCase();
  const hex = randomBytes(6).toString("hex").toUpperCase();
  return `${prefix}-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/** Decrypts an OrderItem's stored codes ("" → none issued). */
export function decryptCodes(stored: string): string[] {
  return stored ? (JSON.parse(decrypt(stored)) as string[]) : [];
}

async function assertWithinDailyLimit(
  userId: string,
  amount: number,
  excludeOrderId?: string,
) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db.order.aggregate({
    _sum: { subtotal: true },
    where: {
      userId,
      status: { in: ["PENDING", "COMPLETED"] },
      createdAt: { gte: since },
      ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
    },
  });
  const used = recent._sum.subtotal ?? 0;
  if (used + amount > DAILY_PURCHASE_LIMIT) {
    throw new CheckoutError(
      `That would take you past the ${formatRupee(DAILY_PURCHASE_LIMIT)} daily purchase limit (${formatRupee(Math.max(0, DAILY_PURCHASE_LIMIT - used))} left today).`,
    );
  }
}

/** Opens a new payment attempt at the gateway; returns where to send the buyer. */
async function startPayment(
  order: { id: string; total: number; paymentMethod: string },
  buyer: Buyer,
): Promise<string> {
  const gateway = getGateway();
  const created = await gateway.createPayment({
    orderId: order.id,
    amount: order.total,
    method: order.paymentMethod,
    customer: { name: buyer.name, email: buyer.email },
    returnUrl: `${await requestOrigin()}/payment/return`,
  });
  await db.payment.create({
    data: {
      orderId: order.id,
      gateway: gateway.id,
      gatewayPaymentId: created.gatewayPaymentId,
      method: order.paymentMethod,
      amount: order.total,
      meta: JSON.stringify({
        ...created.meta,
        redirectUrl: created.redirectUrl,
      }),
    },
  });
  return created.redirectUrl;
}

/**
 * Turns the buyer's cart into a PENDING order priced from the DB (never from
 * the client) and opens a payment for it. Returns the gateway URL.
 */
export async function createOrderFromCart(
  buyer: Buyer,
  methodId: string,
): Promise<{ orderId: string; redirectUrl: string }> {
  const method = getPaymentMethod(methodId);
  if (!method) throw new CheckoutError("Pick a payment method.");

  const items = await db.cartItem.findMany({
    where: { userId: buyer.id },
    include: { brand: true },
  });
  if (items.length === 0) throw new CheckoutError("Your cart is empty.");

  let subtotal = 0;
  let baseCashback = 0;
  for (const item of items) {
    const face = item.denomination * item.quantity;
    subtotal += face;
    baseCashback += (face * item.brand.cashbackPct) / 100;
  }
  if (subtotal > MAX_ORDER_VALUE) {
    throw new CheckoutError(
      `Orders are capped at ${formatRupee(MAX_ORDER_VALUE)} of gift cards — split this cart into smaller orders.`,
    );
  }
  await assertWithinDailyLimit(buyer.id, subtotal);

  const fee = convenienceFee(subtotal, method);
  const order = await db.order.create({
    data: {
      id: newOrderId(),
      userId: buyer.id,
      status: "PENDING",
      subtotal,
      fee,
      total: subtotal + fee,
      cashback: methodCashback(baseCashback, method),
      paymentMethod: method.id,
      items: {
        create: items.map((item) => ({
          brandId: item.brandId,
          brandName: item.brand.name,
          denomination: item.denomination,
          quantity: item.quantity,
          cashbackPct: item.brand.cashbackPct,
        })),
      },
    },
  });

  return { orderId: order.id, redirectUrl: await startPayment(order, buyer) };
}

/** New payment attempt for a FAILED/CANCELLED order (same amount and method). */
export async function retryOrderPayment(
  buyer: Buyer,
  orderId: string,
): Promise<string> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== buyer.id)
    throw new CheckoutError("Order not found.");
  if (order.status !== "FAILED" && order.status !== "CANCELLED") {
    throw new CheckoutError("This order isn't waiting for a new payment.");
  }
  await assertWithinDailyLimit(buyer.id, order.subtotal, order.id);

  const reopened = await db.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { status: "PENDING", failureReason: null },
  });
  if (reopened.count === 0)
    throw new CheckoutError("This order was just updated — refresh.");
  return startPayment(order, buyer);
}

/** Issues the vouchers and marks the order COMPLETED — at most once. */
async function fulfilOrder(orderId: string, paymentRef: string): Promise<void> {
  const fulfilled = await db.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: { not: "COMPLETED" } },
      data: {
        status: "COMPLETED",
        paymentRef,
        paidAt: new Date(),
        failureReason: null,
      },
    });
    if (claimed.count === 0) return null; // a duplicate callback got here first

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { include: { brand: true } }, user: true },
    });
    const issuedAt = new Date();
    for (const item of order.items) {
      const codes = Array.from({ length: item.quantity }, () =>
        voucherCode(item.brandName),
      );
      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          codes: encrypt(JSON.stringify(codes)),
          expiresAt: addMonths(issuedAt, item.brand.validityMonths),
        },
      });
    }
    // Clear just the cart lines this order bought; anything added since stays.
    await tx.cartItem.deleteMany({
      where: {
        userId: order.userId,
        OR: order.items.map((i) => ({
          brandId: i.brandId,
          denomination: i.denomination,
        })),
      },
    });
    return order;
  });

  if (fulfilled) {
    await sendEmail({
      to: fulfilled.user.email,
      subject: `Your gifts19 order ${fulfilled.id} is ready 🎉`,
      text: `Payment of ${formatRupee(fulfilled.total)} received. Your voucher codes are on ${await requestOrigin().catch(() => "")}/orders/${fulfilled.id}`,
    });
  }
}

const TERMINAL_PAYMENT = new Set(["SUCCESS", "FAILED", "CANCELLED"]);

/**
 * Applies what the gateway reported about a payment (from the return
 * redirect, a webhook or a status poll). Safe to call any number of times
 * with the same update. Returns the order id, or null for unknown payments.
 */
export async function applyGatewayUpdate(
  update: GatewayUpdate,
): Promise<string | null> {
  const payment = await db.payment.findUnique({
    where: { gatewayPaymentId: update.gatewayPaymentId },
  });
  if (!payment) return null;

  if (update.amount !== payment.amount) {
    // Never fulfil on a mismatched amount — flag it for manual review.
    console.error(
      `[payments] amount mismatch on ${payment.gatewayPaymentId}: expected ${payment.amount}, gateway said ${update.amount}`,
    );
    update = {
      ...update,
      status: "FAILED",
      failureReason: "Payment amount mismatch — contact support.",
    };
  }

  // A payment can become SUCCESS from any state (gateways do report late
  // successes); other changes only apply while it is still open.
  const canChange =
    update.status === "SUCCESS"
      ? payment.status !== "SUCCESS"
      : !TERMINAL_PAYMENT.has(payment.status) &&
        update.status !== payment.status;
  if (canChange) {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: update.status,
        failureReason: update.failureReason ?? null,
      },
    });
  }

  if (update.status === "SUCCESS") {
    await fulfilOrder(payment.orderId, payment.gatewayPaymentId);
  } else if (update.status === "FAILED" || update.status === "CANCELLED") {
    // Only the latest attempt decides; a stale attempt failing late must not
    // knock over a retry that's in flight.
    const latest = await db.payment.findFirst({
      where: { orderId: payment.orderId },
      orderBy: { createdAt: "desc" },
    });
    if (latest?.id === payment.id) {
      await db.order.updateMany({
        where: { id: payment.orderId, status: "PENDING" },
        data: {
          status: update.status,
          failureReason: update.failureReason ?? null,
        },
      });
    }
  }
  return payment.orderId;
}

/**
 * Brings a PENDING order up to date by asking the gateway about its open
 * payments, and expires attempts the buyer abandoned on the gateway page.
 */
export async function reconcileOrder(orderId: string): Promise<void> {
  const open = await db.payment.findMany({
    where: { orderId, status: { in: ["CREATED", "PENDING"] } },
  });
  for (const payment of open) {
    let update: GatewayUpdate;
    try {
      update = await getGatewayById(payment.gateway).fetchStatus(payment);
    } catch (error) {
      console.error(
        `[payments] status check failed for ${payment.gatewayPaymentId}`,
        error,
      );
      continue;
    }
    const abandoned =
      update.status === "PENDING" &&
      payment.status === "CREATED" &&
      Date.now() - payment.createdAt.getTime() > PAYMENT_SESSION_TTL_MS;
    if (abandoned) {
      update = {
        ...update,
        status: "FAILED",
        failureReason:
          "Payment wasn't completed in time — the session expired.",
      };
    }
    if (update.status !== "PENDING") await applyGatewayUpdate(update);
  }
}

/** Reconciles a buyer's open orders (called when they look at their orders). */
export async function reconcilePendingOrders(userId: string): Promise<void> {
  const pending = await db.order.findMany({
    where: { userId, status: "PENDING" },
    select: { id: true },
    take: 20,
  });
  for (const order of pending) await reconcileOrder(order.id);
}
