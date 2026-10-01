import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { audit } from "../audit";
import { convenienceFeeBps, isDemoMode } from "../config";
import { db, isUniqueViolation } from "../db";
import { UserFacingError } from "../errors";
import { applyBps, CURRENCY, formatINR } from "../money";
import { createPaymentAttempt } from "../payments/service";
import { lineTotals } from "../pricing";
import { PAID_STATUSES } from "./state";

/*
 * Checkout: cart → PAYMENT_PENDING order → payment attempt.
 *
 * Idempotency: the checkout page embeds a random checkoutKey; the order is
 * unique on (userId, checkoutKey). A double click, a browser retry or two
 * simultaneous submits all resolve to the SAME order — the unique index
 * guarantees it even under a race.
 *
 * Prices come only from our DB (never the form) and are snapshotted onto
 * the order, so later price changes never alter it.
 */

export const MAX_ORDER_FACE_VALUE_PAISE = 25_000 * 100;
export const DAILY_FACE_VALUE_LIMIT_PAISE = 50_000 * 100;
const CHECKOUT_KEY = /^[A-Za-z0-9_-]{16,64}$/;

export function newCheckoutKey(): string {
  return randomBytes(16).toString("base64url");
}

function newOrderId(): string {
  return `GC-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export interface CheckoutResult {
  orderId: string;
  /** Where to send the buyer: the gateway page, or our status page. */
  redirectUrl: string;
  resumed: boolean;
}

async function resume(orderId: string): Promise<CheckoutResult> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const payment = order.payments[0];
  const redirectUrl =
    order.status === "PAYMENT_PENDING" &&
    payment?.status === "CREATED" &&
    payment.redirectUrl
      ? payment.redirectUrl
      : `/payment/status/${order.id}`;
  return { orderId, redirectUrl, resumed: true };
}

export async function startCheckout(
  user: User,
  checkoutKey: string,
): Promise<CheckoutResult> {
  if (user.status !== "ACTIVE")
    throw new UserFacingError(
      "This account can't place orders. Contact support.",
      "BLOCKED",
    );
  if (!user.emailVerifiedAt) {
    throw new UserFacingError(
      "Please verify your email address before buying a gift card.",
      "EMAIL_NOT_VERIFIED",
    );
  }
  if (!CHECKOUT_KEY.test(checkoutKey))
    throw new UserFacingError(
      "Checkout expired — please reload the page.",
      "BAD_KEY",
    );

  const existing = await db.order.findUnique({
    where: { userId_checkoutKey: { userId: user.id, checkoutKey } },
  });
  if (existing) return resume(existing.id);

  const cart = await db.cartItem.findMany({
    where: { userId: user.id },
    include: { product: { include: { brand: true, provider: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (cart.length === 0)
    throw new UserFacingError("Your cart is empty.", "EMPTY_CART");

  const lines = cart.map((line) => {
    const p = line.product;
    const available =
      p.status === "ACTIVE" &&
      p.brand.status === "ACTIVE" &&
      p.provider.status === "ACTIVE" &&
      p.denominationType === "FIXED" &&
      p.faceValuePaise != null &&
      p.sellingPricePaise != null &&
      p.costPricePaise != null;
    if (!available) {
      throw new UserFacingError(
        `${p.brand.name} ${p.name} is temporarily unavailable. Remove it from your cart to continue.`,
        "UNAVAILABLE",
      );
    }
    const unit = {
      faceValuePaise: p.faceValuePaise!,
      sellingPricePaise: p.sellingPricePaise!,
      discountPaise: p.faceValuePaise! - p.sellingPricePaise!,
      costPricePaise: p.costPricePaise!,
    };
    return { line, product: p, unit, totals: lineTotals(unit, line.quantity) };
  });

  const face = lines.reduce((s, l) => s + l.totals.faceValuePaise, 0);
  const selling = lines.reduce((s, l) => s + l.totals.sellingPricePaise, 0);
  const discount = lines.reduce((s, l) => s + l.totals.discountPaise, 0);
  const cost = lines.reduce((s, l) => s + l.totals.costPricePaise, 0);
  const fee = applyBps(selling, convenienceFeeBps());

  if (face > MAX_ORDER_FACE_VALUE_PAISE) {
    throw new UserFacingError(
      `Orders are limited to ${formatINR(MAX_ORDER_FACE_VALUE_PAISE)} of gift cards. Please split your cart.`,
      "ORDER_LIMIT",
    );
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db.order.aggregate({
    _sum: { faceValuePaise: true },
    where: {
      userId: user.id,
      createdAt: { gte: since },
      status: {
        in: [
          "PAYMENT_PENDING",
          ...PAID_STATUSES.filter((s) => s !== "REFUNDED"),
        ],
      },
    },
  });
  const used = recent._sum.faceValuePaise ?? 0;
  if (used + face > DAILY_FACE_VALUE_LIMIT_PAISE) {
    throw new UserFacingError(
      `That would exceed the ${formatINR(DAILY_FACE_VALUE_LIMIT_PAISE)} daily limit (${formatINR(Math.max(0, DAILY_FACE_VALUE_LIMIT_PAISE - used))} left today).`,
      "DAILY_LIMIT",
    );
  }

  let order;
  try {
    order = await db.order.create({
      data: {
        id: newOrderId(),
        userId: user.id,
        checkoutKey,
        currency: CURRENCY,
        faceValuePaise: face,
        discountPaise: discount,
        feePaise: fee,
        totalPaise: selling + fee,
        costPricePaise: cost,
        isTest: isDemoMode(),
        items: {
          create: lines.map(({ line, product, unit }) => ({
            productId: product.id,
            brandId: product.brandId,
            providerId: product.providerId,
            brandName: product.brand.name,
            productName: product.name,
            providerProductRef: product.providerProductRef,
            quantity: line.quantity,
            currency: product.currency,
            ...unit,
          })),
        },
      },
    });
  } catch (error) {
    // A concurrent submit with the same key won the race — use its order.
    if (isUniqueViolation(error)) {
      const winner = await db.order.findUnique({
        where: { userId_checkoutKey: { userId: user.id, checkoutKey } },
      });
      if (winner) return resume(winner.id);
    }
    throw error;
  }

  await audit({
    action: "ORDER_CREATED",
    entityType: "Order",
    entityId: order.id,
    orderId: order.id,
    actorType: "CUSTOMER",
    actorId: user.id,
    data: {
      faceValuePaise: face,
      totalPaise: order.totalPaise,
      lines: lines.length,
    },
  });

  const { redirectUrl } = await createPaymentAttempt(order, {
    name: user.name,
    email: user.email,
  });
  return { orderId: order.id, redirectUrl, resumed: false };
}
