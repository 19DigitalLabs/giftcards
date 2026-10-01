import { audit, type ActorType } from "../audit";
import { db } from "../db";
import { getProvider } from "../fulfilment/providers";
import { log } from "../log";
import { getGateway } from "../payments/gateways";
import { applyGatewayState } from "../payments/service";
import { recordIssue, resolveIssue } from "./issues";

/*
 * Three-way reconciliation: our DB vs the payment gateway vs the gift-card
 * provider. It RECORDS discrepancies as ReconciliationIssues for humans.
 *
 * The only things it changes are safe, idempotent catch-ups that the
 * normal flow would do anyway (applying a capture the gateway confirms but
 * whose webhook we missed). It never issues vouchers, never refunds, never
 * moves an order to FULFILLED/REFUNDED by itself.
 */

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const STUCK_FULFILMENT_MS = 15 * 60 * 1000;
const STUCK_PAYMENT_MS = 60 * 60 * 1000;
export const LOW_BALANCE_PAISE = 50_000 * 100;

export interface ReconSummary {
  paymentsChecked: number;
  ordersChecked: number;
  providerOrdersChecked: number;
  issuesOpened: number;
  autoApplied: number;
}

export async function runReconciliation(
  actor: ActorType = "CRON",
): Promise<ReconSummary> {
  const since = new Date(Date.now() - WINDOW_MS);
  const openBefore = await db.reconciliationIssue.count({
    where: { status: "OPEN" },
  });
  const summary: ReconSummary = {
    paymentsChecked: 0,
    ordersChecked: 0,
    providerOrdersChecked: 0,
    issuesOpened: 0,
    autoApplied: 0,
  };

  // ── 1. Payments vs gateway ────────────────────────────────────────────
  const payments = await db.payment.findMany({
    where: {
      createdAt: { gte: since },
      gatewayPaymentId: { not: { startsWith: "unassigned:" } },
    },
    include: { order: true },
    take: 200,
    orderBy: { createdAt: "desc" },
  });
  for (const payment of payments) {
    summary.paymentsChecked++;
    let state;
    try {
      state = await getGateway(payment.gateway).getPaymentStatus(
        payment.gatewayPaymentId,
      );
    } catch (error) {
      log.warn("recon.gateway_lookup_failed", { paymentId: payment.id, error });
      continue;
    }
    const gatewaySucceeded = state.status === "SUCCEEDED";
    const weSucceeded =
      payment.status === "SUCCEEDED" || payment.status === "REFUNDED";

    if (gatewaySucceeded && !weSucceeded) {
      // Missed webhook: apply through the normal, idempotent path.
      await applyGatewayState(payment.id, state, actor);
      summary.autoApplied++;
    } else if (!gatewaySucceeded && weSucceeded) {
      await recordIssue({
        type: "GATEWAY_STATE_MISMATCH",
        severity: "CRITICAL",
        dedupeKey: `GATEWAY_STATE_MISMATCH:${payment.id}`,
        orderId: payment.orderId,
        paymentId: payment.id,
        details: { ours: payment.status, gateway: state.status },
      });
    }
    if (
      gatewaySucceeded &&
      (state.amountPaise !== payment.amountPaise ||
        state.currency !== payment.currency)
    ) {
      await recordIssue({
        type:
          state.currency !== payment.currency
            ? "PAYMENT_CURRENCY_MISMATCH"
            : "PAYMENT_AMOUNT_MISMATCH",
        severity: "CRITICAL",
        dedupeKey: `${state.currency !== payment.currency ? "PAYMENT_CURRENCY_MISMATCH" : "PAYMENT_AMOUNT_MISMATCH"}:${payment.id}`,
        orderId: payment.orderId,
        paymentId: payment.id,
        details: {
          expected: payment.amountPaise,
          gateway: state.amountPaise,
          currency: state.currency,
        },
      });
    }
  }

  // Captured but the order never became paid (and isn't under review).
  const capturedNotPaid = await db.payment.findMany({
    where: {
      status: "SUCCEEDED",
      isExtraCapture: false,
      createdAt: { gte: since },
      order: {
        status: { in: ["PAYMENT_PENDING", "PAYMENT_FAILED", "CANCELLED"] },
      },
    },
  });
  for (const p of capturedNotPaid) {
    await recordIssue({
      type: "CAPTURED_NOT_PAID",
      severity: "CRITICAL",
      dedupeKey: `CAPTURED_NOT_PAID:${p.id}`,
      orderId: p.orderId,
      paymentId: p.id,
    });
  }

  // Double captures without a successful refund.
  const extras = await db.payment.findMany({
    where: { isExtraCapture: true, status: "SUCCEEDED" },
    include: { refunds: true },
  });
  for (const p of extras) {
    if (!p.refunds.some((r) => r.status === "SUCCEEDED")) {
      await recordIssue({
        type: "DOUBLE_CAPTURE",
        severity: "HIGH",
        dedupeKey: `DOUBLE_CAPTURE:${p.id}`,
        orderId: p.orderId,
        paymentId: p.id,
        details: { refunds: p.refunds.map((r) => r.status) },
      });
    }
  }

  // ── 2. Stuck orders ───────────────────────────────────────────────────
  const now = Date.now();
  const stuckFulfilment = await db.order.findMany({
    where: {
      status: { in: ["PAID", "FULFILLING", "FULFILMENT_PENDING"] },
      paidAt: { lt: new Date(now - STUCK_FULFILMENT_MS) },
    },
    select: { id: true, status: true, paidAt: true },
  });
  const stuckIds = new Set(stuckFulfilment.map((o) => o.id));
  for (const o of stuckFulfilment) {
    await recordIssue({
      type: "STUCK_FULFILMENT",
      severity: "HIGH",
      dedupeKey: `STUCK_FULFILMENT:${o.id}`,
      orderId: o.id,
      details: { status: o.status, paidAt: o.paidAt },
    });
  }
  // Auto-resolve stuck-fulfilment issues whose order has moved on.
  const openStuck = await db.reconciliationIssue.findMany({
    where: { type: "STUCK_FULFILMENT", status: "OPEN" },
  });
  for (const issue of openStuck)
    if (issue.orderId && !stuckIds.has(issue.orderId))
      await resolveIssue(issue.dedupeKey);

  const stuckPayments = await db.order.findMany({
    where: {
      status: "PAYMENT_PENDING",
      createdAt: { lt: new Date(now - STUCK_PAYMENT_MS) },
    },
    select: { id: true },
  });
  for (const o of stuckPayments) {
    await recordIssue({
      type: "STUCK_PAYMENT",
      severity: "MEDIUM",
      dedupeKey: `STUCK_PAYMENT:${o.id}`,
      orderId: o.id,
    });
  }

  // ── 3. Our fulfilment records vs the provider ─────────────────────────
  const attempts = await db.fulfilmentAttempt.findMany({
    where: { createdAt: { gte: since } },
    include: {
      orderItem: { include: { order: true } },
      vouchers: { select: { id: true } },
    },
    take: 300,
  });
  const providerCodes = new Map<string, string>();
  for (const prov of await db.provider.findMany())
    providerCodes.set(prov.id, prov.code);

  for (const attempt of attempts) {
    summary.ordersChecked++;
    const provider = getProvider(providerCodes.get(attempt.providerId)!);
    let remote;
    try {
      remote = await provider.getOrderStatus(attempt.providerReference);
    } catch (error) {
      log.warn("recon.provider_lookup_failed", {
        fulfilmentAttemptId: attempt.id,
        error,
      });
      continue;
    }
    const order = attempt.orderItem.order;
    const localVouchers = attempt.vouchers.length;

    if (remote.outcome === "ISSUED" && remote.vouchers.length > localVouchers) {
      // Provider issued cards we don't hold. If the order is still being
      // processed the normal lookup will recover them; otherwise it's money
      // at risk (e.g. order refunded but voucher exists).
      const inFlight = ["PAID", "FULFILLING", "FULFILMENT_PENDING"].includes(
        order.status,
      );
      if (!inFlight) {
        await recordIssue({
          type: "PROVIDER_ISSUED_LOCAL_MISSING",
          severity: "CRITICAL",
          dedupeKey: `PROVIDER_ISSUED_LOCAL_MISSING:${attempt.id}`,
          orderId: order.id,
          attemptId: attempt.id,
          details: {
            providerIssued: remote.vouchers.length,
            local: localVouchers,
            orderStatus: order.status,
          },
        });
      }
    }
    if (
      order.status === "FULFILLED" &&
      attempt.status === "ISSUED" &&
      remote.outcome === "NOT_FOUND"
    ) {
      await recordIssue({
        type: "FULFILLED_MISSING_AT_PROVIDER",
        severity: "CRITICAL",
        dedupeKey: `FULFILLED_MISSING_AT_PROVIDER:${attempt.id}`,
        orderId: order.id,
        attemptId: attempt.id,
      });
    }
  }

  // Provider-side orders we don't know about, and duplicate references.
  const activeProviders = await db.provider.findMany({
    where: { status: "ACTIVE" },
  });
  for (const prov of activeProviders) {
    const adapter = getProvider(prov.code);
    if (!adapter.listOrdersSince) continue;
    let remoteOrders;
    try {
      remoteOrders = await adapter.listOrdersSince(since);
    } catch (error) {
      log.warn("recon.provider_list_failed", { error });
      continue;
    }
    const refs = new Map<string, number>();
    for (const r of remoteOrders)
      refs.set(r.providerReference, (refs.get(r.providerReference) ?? 0) + 1);
    const known = new Set(
      (
        await db.fulfilmentAttempt.findMany({
          where: { providerReference: { in: [...refs.keys()] } },
          select: { providerReference: true },
        })
      ).map((a) => a.providerReference),
    );
    for (const r of remoteOrders) {
      summary.providerOrdersChecked++;
      if (!known.has(r.providerReference)) {
        await recordIssue({
          type: "ORPHAN_PROVIDER_ORDER",
          severity: r.issuedCount > 0 ? "CRITICAL" : "MEDIUM",
          dedupeKey: `ORPHAN_PROVIDER_ORDER:${r.providerOrderRef}`,
          details: {
            providerOrderRef: r.providerOrderRef,
            providerReference: r.providerReference,
            issued: r.issuedCount,
          },
        });
      }
    }
    for (const [ref, count] of refs) {
      if (count > 1) {
        const attempt = await db.fulfilmentAttempt.findUnique({
          where: { providerReference: ref },
        });
        await recordIssue({
          type: "DUPLICATE_PROVIDER_ORDER",
          severity: "CRITICAL",
          dedupeKey: `DUPLICATE_PROVIDER_ORDER:${ref}`,
          orderId: attempt?.orderId,
          attemptId: attempt?.id,
          details: { providerReference: ref, providerOrders: count },
        });
      }
    }
    if (adapter.getBalance) {
      try {
        const balance = await adapter.getBalance();
        if (balance.availablePaise < LOW_BALANCE_PAISE) {
          await recordIssue({
            type: "PROVIDER_BALANCE_LOW",
            severity: "HIGH",
            dedupeKey: `PROVIDER_BALANCE_LOW:${prov.code}`,
            details: { availablePaise: balance.availablePaise },
          });
        } else {
          await resolveIssue(`PROVIDER_BALANCE_LOW:${prov.code}`);
        }
      } catch {
        /* provider down — next run */
      }
    }
  }

  // Duplicate voucher refs can't exist (unique index) — assert anyway.
  const dupVouchers = await db.voucher.groupBy({
    by: ["providerId", "providerVoucherRef"],
    _count: { _all: true },
    having: { providerVoucherRef: { _count: { gt: 1 } } },
  });
  for (const d of dupVouchers) {
    await recordIssue({
      type: "DUPLICATE_VOUCHER_REF",
      severity: "CRITICAL",
      dedupeKey: `DUPLICATE_VOUCHER_REF:${d.providerVoucherRef}`,
      details: { providerVoucherRef: d.providerVoucherRef },
    });
  }

  const openAfter = await db.reconciliationIssue.count({
    where: { status: "OPEN" },
  });
  summary.issuesOpened = Math.max(0, openAfter - openBefore);
  await audit({
    action: "ADMIN_ACTION",
    entityType: "Reconciliation",
    entityId: new Date().toISOString(),
    actorType: actor,
    data: { action: "reconciliation_run", ...summary },
  });
  log.info("reconciliation.done", { ...summary });
  return summary;
}
