import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticate,
  registerUser,
  requestPasswordReset,
  resetPassword,
  verifyEmailToken,
} from "@/lib/auth-service";
import { db } from "@/lib/db";
import { processOrder } from "@/lib/fulfilment/service";
import { rateLimit } from "@/lib/rate-limit";
import { runReconciliation } from "@/lib/reconciliation/service";
import { revealVoucher } from "@/lib/vouchers";
import {
  checkout,
  createUser,
  fastForward,
  orderStatus,
  pay,
  resetDb,
  setProviderScenario,
  vouchersFor,
} from "./helpers";

async function fulfilledOrder() {
  const user = await createUser();
  const { orderId } = await checkout(user);
  await pay(orderId, "SUCCESS");
  await processOrder(orderId);
  return { user, orderId };
}

describe("reconciliation", () => {
  beforeEach(resetDb);

  it("clean system → no issues", async () => {
    await fulfilledOrder();
    await runReconciliation();
    expect(
      await db.reconciliationIssue.count({ where: { status: "OPEN" } }),
    ).toBe(0);
  });

  it("missed webhook: gateway captured, we didn't hear → applied via the normal path", async () => {
    const user = await createUser();
    const { orderId } = await checkout(user);
    const payment = await db.payment.findFirstOrThrow({ where: { orderId } });
    await db.demoGatewayPayment.update({
      where: { gatewayPaymentId: payment.gatewayPaymentId },
      data: { status: "SUCCEEDED", capturedPaise: payment.amountPaise },
    });
    const s = await runReconciliation();
    expect(s.autoApplied).toBe(1);
    expect(await orderStatus(orderId)).toBe("PAID");
  });

  it("provider issued but local voucher missing on a closed order → CRITICAL issue, not auto-fixed", async () => {
    const { orderId } = await fulfilledOrder();
    await db.voucher.deleteMany({ where: { orderItem: { orderId } } });
    await runReconciliation();
    const issue = await db.reconciliationIssue.findFirst({
      where: { type: "PROVIDER_ISSUED_LOCAL_MISSING" },
    });
    expect(issue?.severity).toBe("CRITICAL");
    expect(await vouchersFor(orderId)).toHaveLength(0); // reconciliation never issues/restores by itself
  });

  it("order FULFILLED but provider has no record → CRITICAL issue", async () => {
    const { orderId } = await fulfilledOrder();
    await db.demoProviderOrder.deleteMany();
    await runReconciliation();
    expect(
      await db.reconciliationIssue.count({
        where: { type: "FULFILLED_MISSING_AT_PROVIDER", orderId },
      }),
    ).toBe(1);
  });

  it("gateway says not captured but we think captured → CRITICAL", async () => {
    const { orderId } = await fulfilledOrder();
    const payment = await db.payment.findFirstOrThrow({ where: { orderId } });
    await db.demoGatewayPayment.update({
      where: { gatewayPaymentId: payment.gatewayPaymentId },
      data: { status: "FAILED" },
    });
    await runReconciliation();
    expect(
      await db.reconciliationIssue.count({
        where: { type: "GATEWAY_STATE_MISMATCH" },
      }),
    ).toBe(1);
  });

  it("stuck fulfilment and duplicate provider orders are flagged", async () => {
    const user = await createUser();
    const { orderId } = await checkout(user);
    await pay(orderId, "SUCCESS");
    await db.order.update({
      where: { id: orderId },
      data: { paidAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    await runReconciliation();
    expect(
      await db.reconciliationIssue.count({
        where: { type: "STUCK_FULFILMENT" },
      }),
    ).toBe(1);

    // A non-idempotent provider receiving a re-send creates a duplicate.
    await processOrder(orderId);
    await db.demoControl.update({
      where: { id: "default" },
      data: { providerIdempotent: false },
    });
    const attempt = await db.fulfilmentAttempt.findFirstOrThrow({
      where: { orderId },
    });
    const { apiPlaceOrder } = await import("@/lib/demo/provider-server");
    await apiPlaceOrder({
      client_ref: attempt.providerReference,
      product_ref: "AMAZONPAY-1000",
      quantity: 1,
    });
    await runReconciliation();
    expect(
      await db.reconciliationIssue.count({
        where: { type: "DUPLICATE_PROVIDER_ORDER" },
      }),
    ).toBe(1);
    // Stuck issue auto-resolves once the order completed.
    expect(
      await db.reconciliationIssue.count({
        where: { type: "STUCK_FULFILMENT", status: "OPEN" },
      }),
    ).toBe(0);
  });
});

describe("security", () => {
  beforeEach(resetDb);

  it("owner can reveal; another customer cannot (and the attempt is audited)", async () => {
    const { user, orderId } = await fulfilledOrder();
    const [voucher] = await vouchersFor(orderId);
    const revealed = await revealVoucher(user.id, voucher!.id);
    expect(revealed.code).toMatch(/^TEST-AMAZONPAY-/);
    expect(revealed.isTest).toBe(true);
    expect(
      (await db.voucher.findUniqueOrThrow({ where: { id: voucher!.id } }))
        .revealedAt,
    ).not.toBeNull();

    const intruder = await createUser();
    await expect(revealVoucher(intruder.id, voucher!.id)).rejects.toThrow(
      /access/,
    );
    const audits = await db.auditLog.findMany({
      where: { action: "VOUCHER_REVEALED" },
    });
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits)).not.toContain(revealed.code);
  });

  it("voucher plaintext never appears in logs, audit log, ledger, events or provider responses we store", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "info";
    try {
      await setProviderScenario("TIMEOUT_AFTER_ISSUE");
      const { user, orderId } = await fulfilledOrder();
      const [voucher] = await vouchersFor(orderId);
      const { code } = await revealVoucher(user.id, voucher!.id);
      const logged = [...spy.mock.calls, ...warn.mock.calls, ...err.mock.calls]
        .flat()
        .join("\n");
      expect(logged.length).toBeGreaterThan(0);
      expect(logged).not.toContain(code);
      const stored = JSON.stringify([
        await db.auditLog.findMany(),
        await db.ledgerEntry.findMany(),
        await db.paymentEvent.findMany(),
        await db.fulfilmentAttempt.findMany(),
        await db.reconciliationIssue.findMany(),
        await db.demoEmail.findMany(),
        await db.voucher.findMany(),
      ]);
      expect(stored).not.toContain(code);
    } finally {
      process.env.LOG_LEVEL = "silent";
      spy.mockRestore();
      warn.mockRestore();
      err.mockRestore();
    }
  });

  it("vouchers can't be revealed before the order is fulfilled", async () => {
    const user = await createUser();
    const { orderId } = await checkout(user);
    await pay(orderId, "SUCCESS");
    await setProviderScenario("PENDING_SUCCESS");
    await processOrder(orderId);
    await fastForward();
    expect(await vouchersFor(orderId)).toHaveLength(0);
  });
});

describe("auth", () => {
  beforeEach(resetDb);

  it("signup → verification email → verify; duplicate email refused", async () => {
    const user = await registerUser({
      name: "Asha",
      email: "Asha@Example.com",
      password: "goodpass123",
    });
    expect(user.email).toBe("asha@example.com");
    expect(user.emailVerifiedAt).toBeNull();
    const mail = await db.demoEmail.findFirstOrThrow({
      where: { to: "asha@example.com" },
    });
    const token = /token=([\w-]+)/.exec(mail.text)![1]!;
    expect((await verifyEmailToken(token))?.emailVerifiedAt).not.toBeNull();
    expect(await verifyEmailToken(token)).toBeNull(); // single use
    await expect(
      registerUser({
        name: "Xi",
        email: "asha@example.com",
        password: "goodpass123",
      }),
    ).rejects.toThrow(/already registered/);
    await expect(
      registerUser({
        name: "Xi",
        email: "b@example.com",
        password: "password",
      }),
    ).rejects.toThrow(/number/);
  });

  it("login lockout after 5 wrong passwords; reset unlocks and signs out sessions", async () => {
    const user = await createUser({ email: "lock@test.dev" });
    await db.session.create({
      data: {
        tokenHash: "x".repeat(64),
        userId: user.id,
        expiresAt: new Date(Date.now() + 1e7),
      },
    });
    for (let i = 0; i < 4; i++)
      await expect(authenticate("lock@test.dev", "wrongpass1")).rejects.toThrow(
        /Incorrect/,
      );
    await expect(authenticate("lock@test.dev", "wrongpass1")).rejects.toThrow(
      /locked/,
    );
    await expect(authenticate("lock@test.dev", "password123")).rejects.toThrow(
      /Too many/,
    );

    await requestPasswordReset("lock@test.dev");
    const mail = await db.demoEmail.findFirstOrThrow({
      where: { to: "lock@test.dev", template: "PASSWORD_RESET" },
    });
    const token = /token=([\w-]+)/.exec(mail.text)![1]!;
    await resetPassword(token, "brandnew123");
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await authenticate("lock@test.dev", "brandnew123")).id).toBe(
      user.id,
    );
    await expect(resetPassword(token, "another123")).rejects.toThrow(
      /invalid or has expired/,
    );
  });

  it("unknown email gets the generic error; blocked users can't log in", async () => {
    await expect(authenticate("nobody@test.dev", "whatever1")).rejects.toThrow(
      /Incorrect email or password/,
    );
    const user = await createUser({ email: "blocked@test.dev" });
    await db.user.update({
      where: { id: user.id },
      data: { status: "BLOCKED" },
    });
    await expect(
      authenticate("blocked@test.dev", "password123"),
    ).rejects.toThrow(/suspended/);
  });

  it("DB rate limiter counts across calls and resets after the window", async () => {
    const results = [];
    for (let i = 0; i < 4; i++)
      results.push((await rateLimit("t:1", 3, 60_000)).ok);
    expect(results).toEqual([true, true, true, false]);
    const r = await rateLimit("t:1", 3, 60_000);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(r.retryAfter).toBeLessThanOrEqual(60);
    await db.rateLimitBucket.update({
      where: { key: "t:1" },
      data: { resetAt: new Date(Date.now() - 1000) },
    });
    expect((await rateLimit("t:1", 3, 60_000)).ok).toBe(true);
  });
});
