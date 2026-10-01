import { randomBytes } from "node:crypto";
import type { User, UserRole } from "@prisma/client";
import { syncCatalogue } from "@/lib/catalogue/sync";
import { db } from "@/lib/db";
import type { DemoPaymentScenario } from "@/lib/demo/gateway-server";
import {
  seedDemoProvider,
  type DemoProviderScenario,
} from "@/lib/demo/provider-server";
import { runDemoPaymentScenario } from "@/lib/demo/scenarios";
import { startCheckout } from "@/lib/orders/checkout";
import { hashPassword } from "@/lib/password";
import { refreshPayment } from "@/lib/payments/service";

/** Wipes every table and re-seeds the demo provider + our catalogue. */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
  await seedDemoProvider();
  await syncCatalogue("DEMO");
}

let passwordHash: string | undefined;

export async function createUser(
  opts: { verified?: boolean; role?: UserRole; email?: string } = {},
): Promise<User> {
  passwordHash ??= await hashPassword("password123");
  return db.user.create({
    data: {
      email: opts.email ?? `user-${randomBytes(4).toString("hex")}@test.dev`,
      name: "Test User",
      passwordHash,
      role: opts.role ?? "CUSTOMER",
      emailVerifiedAt: opts.verified === false ? null : new Date(),
    },
  });
}

export async function product(sku: string) {
  return db.product.findUniqueOrThrow({ where: { sku } });
}

/** Amazon Pay ₹1,000: face ₹1,000 · demo cost ₹975 · selling ₹990. */
export const AMAZON_1000 = "DEMO-AMAZONPAY-1000";

export async function addToCart(user: User, sku: string, quantity = 1) {
  const p = await product(sku);
  return db.cartItem.upsert({
    where: { userId_productId: { userId: user.id, productId: p.id } },
    update: { quantity },
    create: {
      userId: user.id,
      productId: p.id,
      quantity,
      priceAtAddPaise: p.sellingPricePaise!,
    },
  });
}

export function key() {
  return randomBytes(16).toString("base64url");
}

export async function checkout(user: User, sku = AMAZON_1000, quantity = 1) {
  await addToCart(user, sku, quantity);
  return startCheckout(user, key());
}

export async function latestPayment(orderId: string) {
  return db.payment.findFirstOrThrow({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Plays a demo-gateway scenario for the order's latest payment, then does
 * what our return route does (confirm server-to-server).
 */
export async function pay(
  orderId: string,
  scenario: DemoPaymentScenario = "SUCCESS",
) {
  const payment = await latestPayment(orderId);
  await runDemoPaymentScenario(payment.gatewayPaymentId, scenario);
  const latest = await latestPayment(orderId);
  await refreshPayment(latest.id, "GATEWAY");
  return db.order.findUniqueOrThrow({ where: { id: orderId } });
}

export async function setProviderScenario(
  scenario: DemoProviderScenario,
  opts: { sticky?: boolean; idempotent?: boolean } = {},
) {
  await db.demoControl.update({
    where: { id: "default" },
    data: {
      providerScenario: scenario,
      providerSticky: opts.sticky ?? false,
      ...(opts.idempotent === undefined
        ? {}
        : { providerIdempotent: opts.idempotent }),
    },
  });
}

/** Fast-forwards every simulated delay (gateway/provider settlements, re-checks). */
export async function fastForward() {
  const past = new Date(Date.now() - 1000);
  await db.demoGatewayPayment.updateMany({
    where: { settleAt: { not: null } },
    data: { settleAt: past },
  });
  await db.demoProviderOrder.updateMany({
    where: { settleAt: { not: null } },
    data: { settleAt: past },
  });
  await db.fulfilmentAttempt.updateMany({
    where: { nextCheckAt: { not: null } },
    data: { nextCheckAt: past },
  });
  await db.order.updateMany({
    where: { nextCheckAt: { not: null } },
    data: { nextCheckAt: past },
  });
  await db.demoControl.update({
    where: { id: "default" },
    data: { providerDownUntil: null },
  });
}

export async function providerBalance() {
  return (
    await db.demoProviderAccount.findUniqueOrThrow({ where: { id: "DEMO" } })
  ).balancePaise;
}

export async function orderStatus(orderId: string) {
  return (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status;
}

export async function vouchersFor(orderId: string) {
  return db.voucher.findMany({
    where: { orderItem: { orderId } },
    orderBy: { unitIndex: "asc" },
  });
}

export async function ledger(orderId: string) {
  return db.ledgerEntry.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
  });
}

export async function providerOrdersFor(orderId: string) {
  const refs = (
    await db.fulfilmentAttempt.findMany({ where: { orderId } })
  ).map((a) => a.providerReference);
  return db.demoProviderOrder.findMany({
    where: { providerReference: { in: refs } },
  });
}
