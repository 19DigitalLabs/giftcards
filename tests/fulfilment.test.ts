import { beforeEach, describe, expect, it } from "vitest";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  adminRetryFulfilment,
  processOrder,
  recoverOrderByLookup,
  runFulfilmentBatch,
} from "@/lib/fulfilment/service";
import { runScheduledWork } from "@/lib/jobs";
import {
  AMAZON_1000,
  checkout,
  createUser,
  fastForward,
  ledger,
  orderStatus,
  pay,
  providerBalance,
  providerOrdersFor,
  resetDb,
  setProviderScenario,
  vouchersFor,
} from "./helpers";

async function paidOrder(sku = AMAZON_1000, quantity = 1) {
  const user = await createUser();
  const { orderId } = await checkout(user, sku, quantity);
  const order = await pay(orderId, "SUCCESS");
  expect(order.status).toBe("PAID");
  return { user, orderId };
}

describe("fulfilment", () => {
  beforeEach(resetDb);

  it("SUCCESS: issues one encrypted TEST voucher, debits provider ₹975, books ledger", async () => {
    const before = await providerBalance();
    const { orderId } = await paidOrder();
    expect(await processOrder(orderId)).toBe("FULFILLED");

    const vouchers = await vouchersFor(orderId);
    expect(vouchers).toHaveLength(1);
    const code = decrypt(vouchers[0]!.codeEncrypted);
    expect(code).toMatch(/^TEST-AMAZONPAY-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(vouchers[0]!.codeEncrypted).not.toContain(code);
    expect(vouchers[0]!.isTest).toBe(true);
    expect(vouchers[0]!.codeLast4).toBe(code.slice(-4));

    expect(before - (await providerBalance())).toBe(97500);
    const entries = await ledger(orderId);
    expect(entries.map((e) => [e.type, e.amountPaise])).toEqual([
      ["PAYMENT_CAPTURED", 99000],
      ["PROVIDER_COST", -97500],
    ]);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.fulfilledAt).not.toBeNull();
    const audit = await db.auditLog.findMany({ where: { orderId } });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "PAYMENT_VERIFIED",
        "PROVIDER_REQUESTED",
        "VOUCHER_STORED",
      ]),
    );
  });

  it("TIMEOUT AFTER ISSUE: recovers the original voucher by lookup — ONE voucher, ONE debit, ONE provider order", async () => {
    const before = await providerBalance();
    const { orderId } = await paidOrder();
    await setProviderScenario("TIMEOUT_AFTER_ISSUE");

    expect(await processOrder(orderId)).toBe("FULFILLED");

    const providerOrders = await providerOrdersFor(orderId);
    expect(providerOrders).toHaveLength(1);
    expect(providerOrders[0]!.issuedCount).toBe(1);
    const vouchers = await vouchersFor(orderId);
    expect(vouchers).toHaveLength(1);
    expect(before - (await providerBalance())).toBe(97500); // one debit only
    expect(await db.demoProviderDebit.count()).toBe(1);

    const attempt = await db.fulfilmentAttempt.findFirstOrThrow({
      where: { orderId },
    });
    expect(attempt.placeCalls).toBe(1); // never re-sent
    expect(attempt.statusChecks).toBe(1);
    expect(attempt.status).toBe("ISSUED");
    const actions = (
      await db.auditLog.findMany({
        where: { orderId },
        orderBy: { createdAt: "asc" },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "PROVIDER_TIMEOUT",
        "PROVIDER_STATUS_CHECKED",
        "VOUCHER_STORED",
      ]),
    );
    expect(
      (await ledger(orderId)).filter((e) => e.type === "PROVIDER_COST"),
    ).toHaveLength(1);
  });

  it("TIMEOUT AFTER ISSUE with a NON-idempotent provider still recovers by lookup without re-sending", async () => {
    const { orderId } = await paidOrder();
    await setProviderScenario("TIMEOUT_AFTER_ISSUE", { idempotent: false });
    expect(await processOrder(orderId)).toBe("FULFILLED");
    expect(await providerOrdersFor(orderId)).toHaveLength(1);
    expect(await vouchersFor(orderId)).toHaveLength(1);
  });

  it("TIMEOUT BEFORE ISSUE: lookup says NOT_FOUND, safe re-send with the SAME reference issues once", async () => {
    const before = await providerBalance();
    const { orderId } = await paidOrder();
    await setProviderScenario("TIMEOUT_BEFORE_ISSUE");
    expect(await processOrder(orderId)).toBe("FULFILLED");
    const attempts = await db.fulfilmentAttempt.findMany({
      where: { orderId },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.placeCalls).toBe(2);
    expect(await providerOrdersFor(orderId)).toHaveLength(1);
    expect(before - (await providerBalance())).toBe(97500);
  });

  it("TIMEOUT BEFORE ISSUE with a NON-idempotent provider goes to MANUAL_REVIEW (no blind retry)", async () => {
    const { orderId } = await paidOrder();
    await setProviderScenario("TIMEOUT_BEFORE_ISSUE", { idempotent: false });
    expect(await processOrder(orderId)).toBe("MANUAL_REVIEW");
    const attempt = await db.fulfilmentAttempt.findFirstOrThrow({
      where: { orderId },
    });
    expect(attempt.placeCalls).toBe(1);
    expect(attempt.status).toBe("NOT_FOUND");
    expect(await vouchersFor(orderId)).toHaveLength(0);
  });

  it("DEFINITIVE FAILURE: FULFILMENT_FAILED → refund → REFUNDED, no provider debit", async () => {
    const before = await providerBalance();
    const { orderId } = await paidOrder();
    await setProviderScenario("FAILURE");
    expect(await processOrder(orderId)).toBe("REFUNDED");
    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { refunds: true },
    });
    expect(order.refunds).toHaveLength(1);
    expect(order.refunds[0]!.status).toBe("SUCCEEDED");
    expect(await providerBalance()).toBe(before);
    const entries = await ledger(orderId);
    expect(entries.map((e) => e.type)).toEqual([
      "PAYMENT_CAPTURED",
      "PAYMENT_REFUNDED",
    ]);
    expect(entries.reduce((s, e) => s + e.amountPaise, 0)).toBe(0);
    const transitions = await db.auditLog.findMany({
      where: { orderId, action: "ORDER_STATE_CHANGED" },
      orderBy: { createdAt: "asc" },
    });
    expect(transitions.map((t) => (t.data as { to: string }).to)).toEqual([
      "PAID",
      "FULFILLING",
      "FULFILMENT_FAILED",
      "REFUND_PENDING",
      "REFUNDED",
    ]);
  });

  it("PENDING → SUCCESS: parks as FULFILMENT_PENDING, then issues on re-check", async () => {
    const { orderId } = await paidOrder();
    await setProviderScenario("PENDING_SUCCESS");
    expect(await processOrder(orderId)).toBe("FULFILMENT_PENDING");
    expect(await processOrder(orderId)).toBeNull(); // not due yet
    await fastForward();
    expect(await processOrder(orderId)).toBe("FULFILLED");
    expect(await vouchersFor(orderId)).toHaveLength(1);
    const attempt = await db.fulfilmentAttempt.findFirstOrThrow({
      where: { orderId },
    });
    expect(attempt.placeCalls).toBe(1);
  });

  it("PENDING → FAILURE: ends refunded", async () => {
    const { orderId } = await paidOrder();
    await setProviderScenario("PENDING_FAILURE");
    expect(await processOrder(orderId)).toBe("FULFILMENT_PENDING");
    await fastForward();
    expect(await processOrder(orderId)).toBe("REFUNDED");
  });

  it("MALFORMED response: treated as ambiguous, recovered by lookup, one voucher", async () => {
    const { orderId } = await paidOrder();
    await setProviderScenario("MALFORMED");
    expect(await processOrder(orderId)).toBe("FULFILLED");
    expect(await providerOrdersFor(orderId)).toHaveLength(1);
    expect(await vouchersFor(orderId)).toHaveLength(1);
    const attempt = await db.fulfilmentAttempt.findFirstOrThrow({
      where: { orderId },
    });
    expect(attempt.placeCalls).toBe(1);
  });

  it("PROVIDER DOWN: waits, then completes once the provider is back", async () => {
    const { orderId } = await paidOrder();
    await setProviderScenario("PROVIDER_DOWN");
    expect(await processOrder(orderId)).toBe("FULFILMENT_PENDING");
    await fastForward(); // provider back up, re-check due
    expect(await processOrder(orderId)).toBe("FULFILLED");
    expect(await providerOrdersFor(orderId)).toHaveLength(1);
  });

  it("PARTIAL fulfilment (qty 2, 1 issued) → MANUAL_REVIEW, stored voucher kept", async () => {
    const { orderId } = await paidOrder(AMAZON_1000, 2);
    await setProviderScenario("PARTIAL");
    expect(await processOrder(orderId)).toBe("MANUAL_REVIEW");
    expect(await vouchersFor(orderId)).toHaveLength(1);
    expect(
      await db.reconciliationIssue.count({
        where: { orderId, type: "FULFILMENT_REVIEW" },
      }),
    ).toBe(1);
  });

  it("INSUFFICIENT BALANCE → MANUAL_REVIEW, no blind retry; admin retry after top-up issues once", async () => {
    const { orderId } = await paidOrder();
    await db.demoProviderAccount.update({
      where: { id: "DEMO" },
      data: { balancePaise: 50000 },
    });
    expect(await processOrder(orderId)).toBe("MANUAL_REVIEW");
    expect(await vouchersFor(orderId)).toHaveLength(0);
    expect(await runFulfilmentBatch()).toMatchObject({ considered: 0 }); // cron leaves it alone
    expect(
      await db.reconciliationIssue.count({
        where: { type: "PROVIDER_BALANCE_LOW" },
      }),
    ).toBe(1);

    await db.demoProviderAccount.update({
      where: { id: "DEMO" },
      data: { balancePaise: 1_000_000_00 },
    });
    expect(await adminRetryFulfilment(orderId, { type: "ADMIN" })).toBe(
      "FULFILLED",
    );
    const attempts = await db.fulfilmentAttempt.findMany({
      where: { orderId },
      orderBy: { attemptNumber: "asc" },
    });
    expect(attempts.map((a) => a.status)).toEqual(["FAILED", "ISSUED"]);
    expect(await vouchersFor(orderId)).toHaveLength(1);
  });

  it("admin retry refuses ambiguous attempts", async () => {
    const { orderId } = await paidOrder();
    await setProviderScenario("TIMEOUT_BEFORE_ISSUE", { idempotent: false });
    expect(await processOrder(orderId)).toBe("MANUAL_REVIEW");
    // NOT_FOUND confirmed → retry allowed, new reference.
    await db.demoControl.update({
      where: { id: "default" },
      data: { providerIdempotent: true },
    });
    expect(await adminRetryFulfilment(orderId, { type: "ADMIN" })).toBe(
      "FULFILLED",
    );
    expect(await vouchersFor(orderId)).toHaveLength(1);
  });

  it("duplicate / concurrent processor invocations issue exactly once", async () => {
    const { orderId } = await paidOrder();
    const results = await Promise.all([
      processOrder(orderId),
      processOrder(orderId),
      processOrder(orderId),
    ]);
    expect(results.filter((r) => r === "FULFILLED")).toHaveLength(1);
    expect(await vouchersFor(orderId)).toHaveLength(1);
    expect(await providerOrdersFor(orderId)).toHaveLength(1);
    // And re-running after completion does nothing.
    expect(await processOrder(orderId)).toBeNull();
  });

  it("cron runs twice concurrently: each order fulfilled once", async () => {
    const a = await paidOrder();
    const b = await paidOrder();
    await Promise.all([runScheduledWork(), runScheduledWork()]);
    for (const id of [a.orderId, b.orderId]) {
      expect(await orderStatus(id)).toBe("FULFILLED");
      expect(await vouchersFor(id)).toHaveLength(1);
    }
    expect(await db.demoProviderOrder.count()).toBe(2);
  });

  it("CRASH after payment, before processing: cron recovers", async () => {
    const { orderId } = await paidOrder(); // PAID, processor never ran
    await runScheduledWork();
    expect(await orderStatus(orderId)).toBe("FULFILLED");
  });

  it("CRASH mid-call (attempt committed, provider issued, response never saved): stale lease taken over, recovered by lookup", async () => {
    const { orderId } = await paidOrder();
    // Simulate: processor claimed, committed attempt with placeCalls=1,
    // the provider issued, then the process died before recording anything.
    await processOrder(orderId); // fulfils normally — we then rewind OUR side only
    const attempt = await db.fulfilmentAttempt.findFirstOrThrow({
      where: { orderId },
    });
    await db.voucher.deleteMany({ where: { fulfilmentAttemptId: attempt.id } });
    await db.fulfilmentAttempt.update({
      where: { id: attempt.id },
      data: { status: "REQUESTED", providerOrderRef: null },
    });
    await db.order.update({
      where: { id: orderId },
      data: { status: "FULFILLING", leaseUntil: new Date(Date.now() - 60_000) },
    });

    expect(await processOrder(orderId)).toBe("FULFILLED"); // takeover → lookup → recover
    expect(await vouchersFor(orderId)).toHaveLength(1);
    expect(await providerOrdersFor(orderId)).toHaveLength(1);
    const after = await db.fulfilmentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(after.placeCalls).toBe(1); // recovered without re-sending
  });

  it("CRASH before the provider call (placeCalls=0) places exactly once on recovery", async () => {
    const { orderId } = await paidOrder();
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId } });
    await db.fulfilmentAttempt.create({
      data: {
        orderId,
        orderItemId: item.id,
        providerId: item.providerId,
        providerReference: `${item.id}-1`,
        attemptNumber: 1,
        quantity: 1,
      },
    });
    await db.order.update({
      where: { id: orderId },
      data: { status: "FULFILLING", leaseUntil: new Date(Date.now() - 60_000) },
    });
    expect(await processOrder(orderId)).toBe("FULFILLED");
    expect(await providerOrdersFor(orderId)).toHaveLength(1);
  });

  it("admin 'check provider status' recovers a MANUAL_REVIEW order when the provider shows it issued", async () => {
    const { orderId } = await paidOrder();
    await setProviderScenario("PENDING_SUCCESS");
    await processOrder(orderId);
    // Push it to review by exhausting checks while pending.
    await db.fulfilmentAttempt.updateMany({
      where: { orderId },
      data: { statusChecks: 99 },
    });
    await db.order.update({
      where: { id: orderId },
      data: { nextCheckAt: new Date(Date.now() - 1000) },
    });
    await db.fulfilmentAttempt.updateMany({
      where: { orderId },
      data: { nextCheckAt: new Date(Date.now() - 1000) },
    });
    expect(await processOrder(orderId)).toBe("MANUAL_REVIEW");
    await fastForward();
    expect(await recoverOrderByLookup(orderId, { type: "ADMIN" })).toBe(
      "FULFILLED",
    );
    expect(await vouchersFor(orderId)).toHaveLength(1);
  });
});
