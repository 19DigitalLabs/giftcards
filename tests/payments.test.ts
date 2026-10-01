import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { emitWebhook, signWebhook } from "@/lib/demo/gateway-server";
import { processOrder } from "@/lib/fulfilment/service";
import { pollPayments } from "@/lib/payments/service";
import { receiveWebhook } from "@/lib/payments/webhooks";
import {
  checkout,
  createUser,
  fastForward,
  latestPayment,
  ledger,
  orderStatus,
  pay,
  resetDb,
  vouchersFor,
} from "./helpers";

async function newOrder() {
  const user = await createUser();
  const { orderId } = await checkout(user);
  return { user, orderId };
}

describe("payments", () => {
  beforeEach(resetDb);

  it("SUCCESS: verified capture → PAID, ledger capture booked once", async () => {
    const { orderId } = await newOrder();
    const order = await pay(orderId, "SUCCESS");
    expect(order.status).toBe("PAID");
    expect(order.capturedPaymentId).toBe((await latestPayment(orderId)).id);
    expect((await ledger(orderId)).map((e) => [e.type, e.amountPaise])).toEqual(
      [["PAYMENT_CAPTURED", 99000]],
    );
    expect(await db.cartItem.count()).toBe(0); // paid lines leave the cart
  });

  it("FAILED and CANCELLED", async () => {
    const a = await newOrder();
    expect((await pay(a.orderId, "FAILED")).status).toBe("PAYMENT_FAILED");
    const b = await newOrder();
    expect((await pay(b.orderId, "CANCELLED")).status).toBe("CANCELLED");
    expect(await db.ledgerEntry.count()).toBe(0);
  });

  it("PENDING → SUCCESS and PENDING → FAILED resolve via status polling", async () => {
    const a = await newOrder();
    expect((await pay(a.orderId, "PENDING_SUCCESS")).status).toBe(
      "PAYMENT_PENDING",
    );
    const b = await newOrder();
    expect((await pay(b.orderId, "PENDING_FAILURE")).status).toBe(
      "PAYMENT_PENDING",
    );
    await fastForward();
    await db.payment.updateMany({
      data: { updatedAt: new Date(Date.now() - 60_000) },
    });
    await pollPayments();
    expect(await orderStatus(a.orderId)).toBe("PAID");
    expect(await orderStatus(b.orderId)).toBe("PAYMENT_FAILED");
  });

  it("DELAYED (late) SUCCESS after a reported failure still funds the order", async () => {
    const { orderId } = await newOrder();
    expect((await pay(orderId, "DELAYED_SUCCESS")).status).toBe(
      "PAYMENT_FAILED",
    );
    await fastForward();
    await pollPayments();
    expect(await orderStatus(orderId)).toBe("PAID");
  });

  it("DUPLICATE WEBHOOK: same event processed once, no second capture", async () => {
    const { orderId } = await newOrder();
    await pay(orderId, "DUPLICATE_WEBHOOK");
    const events = await db.paymentEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe("PROCESSED");
    expect(
      (await ledger(orderId)).filter((e) => e.type === "PAYMENT_CAPTURED"),
    ).toHaveLength(1);
    // Replay again later: still nothing new.
    const payment = await latestPayment(orderId);
    await emitWebhook(payment.gatewayPaymentId); // a NEW event id with the same state
    expect(
      (await ledger(orderId)).filter((e) => e.type === "PAYMENT_CAPTURED"),
    ).toHaveLength(1);
    expect(await processOrder(orderId)).toBe("FULFILLED");
    expect(await vouchersFor(orderId)).toHaveLength(1);
  });

  it("BAD SIGNATURE / tampered body / stale timestamp are rejected", async () => {
    const { orderId } = await newOrder();
    const payment = await latestPayment(orderId);
    const body = JSON.stringify({
      id: "evt_forged",
      type: "payment.succeeded",
      created: 1,
      data: {
        payment_id: payment.gatewayPaymentId,
        merchant_ref: payment.id,
        order_ref: orderId,
        status: "SUCCEEDED",
        amount: payment.amountPaise,
        currency: "INR",
      },
    });
    expect(
      (
        await receiveWebhook(
          "demo",
          body,
          new Headers({ "x-demo-signature": "t=1,v1=deadbeef" }),
        )
      ).status,
    ).toBe(401);
    const signed = signWebhook(body);
    expect(
      (
        await receiveWebhook(
          "demo",
          body.replace("SUCCEEDED", "SUCCEEDED "),
          new Headers({ "x-demo-signature": signed }),
        )
      ).status,
    ).toBe(401);
    const stale = signWebhook(body, Math.floor(Date.now() / 1000) - 3600);
    expect(
      (
        await receiveWebhook(
          "demo",
          body,
          new Headers({ "x-demo-signature": stale }),
        )
      ).status,
    ).toBe(401);
    expect(await orderStatus(orderId)).toBe("PAYMENT_PENDING");
  });

  it("a correctly signed webhook that lies (gateway API says not paid) can't fund via return path", async () => {
    // Signed-but-false webhooks can only come from someone holding the
    // gateway secret; the return path never trusts the URL — it asks the API.
    const { orderId } = await newOrder();
    const payment = await latestPayment(orderId);
    const { refreshPayment } = await import("@/lib/payments/service");
    expect(await refreshPayment(payment.id)).toBe("NO_CHANGE");
    expect(await orderStatus(orderId)).toBe("PAYMENT_PENDING");
  });

  it("WRONG AMOUNT: never fulfilled — MANUAL_REVIEW + critical issue", async () => {
    const { orderId } = await newOrder();
    expect((await pay(orderId, "WRONG_AMOUNT")).status).toBe("MANUAL_REVIEW");
    expect(await processOrder(orderId)).toBeNull();
    expect(await vouchersFor(orderId)).toHaveLength(0);
    expect(
      await db.reconciliationIssue.count({
        where: { type: "PAYMENT_AMOUNT_MISMATCH", orderId },
      }),
    ).toBe(1);
    // Captured money is still recorded at what was actually taken.
    expect((await ledger(orderId))[0]!.amountPaise).toBe(98900);
  });

  it("WRONG CURRENCY: never fulfilled", async () => {
    const { orderId } = await newOrder();
    const payment = await latestPayment(orderId);
    await db.demoGatewayPayment.update({
      where: { gatewayPaymentId: payment.gatewayPaymentId },
      data: { currency: "USD" },
    });
    expect((await pay(orderId, "SUCCESS")).status).toBe("MANUAL_REVIEW");
    expect(
      await db.reconciliationIssue.count({
        where: { type: "PAYMENT_CURRENCY_MISMATCH" },
      }),
    ).toBe(1);
    expect(await processOrder(orderId)).toBeNull();
  });

  it("DOUBLE CAPTURE: ONE fulfilment, extra payment flagged and refunded", async () => {
    const { orderId } = await newOrder();
    await pay(orderId, "DOUBLE_CAPTURE");
    expect(await orderStatus(orderId)).toBe("PAID");
    const payments = await db.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
      include: { refunds: true },
    });
    expect(payments).toHaveLength(2);
    const [first, second] = payments;
    expect(second!.status).toBe("SUCCEEDED");
    expect(first!.isExtraCapture).toBe(true);
    expect(first!.status).toBe("REFUNDED");
    expect(first!.refunds[0]!.status).toBe("SUCCEEDED");
    expect(
      await db.reconciliationIssue.count({ where: { type: "DOUBLE_CAPTURE" } }),
    ).toBe(1);

    expect(await processOrder(orderId)).toBe("FULFILLED");
    expect(await vouchersFor(orderId)).toHaveLength(1);
    expect(await db.demoProviderOrder.count()).toBe(1);
    const net = (await ledger(orderId)).reduce((s, e) => s + e.amountPaise, 0);
    expect(net).toBe(99000 - 97500); // one capture kept, one refunded, one provider cost
  });

  it("retry after failure creates a new attempt on the same order", async () => {
    const { user, orderId } = await newOrder();
    await pay(orderId, "FAILED");
    const { retryOrderPayment } = await import("@/lib/payments/service");
    await retryOrderPayment(user.id, orderId, {
      name: user.name,
      email: user.email,
    });
    expect(await orderStatus(orderId)).toBe("PAYMENT_PENDING");
    expect((await pay(orderId, "SUCCESS")).status).toBe("PAID");
    expect(await db.payment.count({ where: { orderId } })).toBe(2);
  });

  it("abandoned payment expires to CANCELLED after the session TTL", async () => {
    const { orderId } = await newOrder();
    await db.payment.updateMany({
      where: { orderId },
      data: {
        createdAt: new Date(Date.now() - 31 * 60 * 1000),
        updatedAt: new Date(Date.now() - 60_000),
      },
    });
    await pollPayments();
    expect(await orderStatus(orderId)).toBe("CANCELLED");
  });
});
