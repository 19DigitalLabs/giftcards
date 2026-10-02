import type {
  FulfilmentAttempt,
  Order,
  OrderItem,
  OrderStatus,
} from "@prisma/client";
import { audit, type ActorType } from "../audit";
import { encrypt, KEY_VERSION } from "../crypto";
import { db, isUniqueViolation } from "../db";
import { notifyCustomer } from "../notifications";
import { UserFacingError } from "../errors";
import { recordLedgerEntry } from "../ledger";
import { log } from "../log";
import {
  claimOrderForFulfilment,
  parkOrder,
  renewLease,
  transitionOrder,
  type Lease,
} from "../orders/state";
import { startOrderRefund } from "../payments/refunds";
import { recordIssue } from "../reconciliation/issues";
import { getProvider } from "./providers";
import {
  ProviderError,
  type GiftCardProvider,
  type ProviderCapabilities,
  type ProviderLookupResult,
  type ProviderOrderResult,
} from "./types";

/*
 * FulfilmentService — turns a PAID order into vouchers, safely.
 *
 * The rules that keep a ₹10,000 voucher from being issued twice:
 *
 *  1. Only the holder of the order's lease talks to the provider.
 *  2. Every provider order is preceded by a FulfilmentAttempt row with OUR
 *     unique providerReference, COMMITTED before the call, with placeCalls
 *     incremented first. So after any crash we know whether a call may
 *     have happened.
 *  3. No remote call ever runs inside a DB transaction.
 *  4. An ambiguous outcome (timeout, malformed reply, provider down, crash
 *     mid-call) is NEVER answered by placing another order. We look the
 *     order up by our reference:
 *        found + issued   → store those vouchers (recovery)
 *        found + pending  → check again later
 *        found + failed   → definitive failure
 *        not found        → re-send the SAME reference only if the provider
 *                           guarantees idempotency; otherwise MANUAL_REVIEW
 *        lookup fails     → check again later; eventually MANUAL_REVIEW
 *  5. Vouchers are unique per (attempt, unit) and per provider voucher ref,
 *     and the provider cost is booked once per attempt.
 */

export const LEASE_MS = 60_000;
export const RECHECK_MS = 15_000;
export const MAX_STATUS_CHECKS = 20;
export const MAX_PLACE_CALLS = 3;

type ItemOutcome =
  | { kind: "ISSUED" }
  | { kind: "PENDING"; nextCheckAt: Date }
  | { kind: "FAILED"; code: string; message: string }
  | { kind: "REVIEW"; reason: string };

interface Ctx {
  provider: GiftCardProvider;
  caps: ProviderCapabilities;
  item: OrderItem;
  orderId: string;
  /** false = status lookups only (admin "check provider status"). */
  allowPlace: boolean;
}

const providerCache = new Map<string, string>();

async function providerFor(providerId: string): Promise<GiftCardProvider> {
  let code = providerCache.get(providerId);
  if (!code) {
    code = (await db.provider.findUniqueOrThrow({ where: { id: providerId } }))
      .code;
    providerCache.set(providerId, code);
  }
  return getProvider(code);
}

// ─── Attempt bookkeeping ───────────────────────────────────────────────

async function openAttempt(
  item: OrderItem,
  attemptNumber: number,
): Promise<FulfilmentAttempt> {
  try {
    return await db.fulfilmentAttempt.create({
      data: {
        orderId: item.orderId,
        orderItemId: item.id,
        providerId: item.providerId,
        providerReference: `${item.id}-${attemptNumber}`,
        attemptNumber,
        quantity: item.quantity,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return db.fulfilmentAttempt.findUniqueOrThrow({
      where: {
        orderItemId_attemptNumber: { orderItemId: item.id, attemptNumber },
      },
    });
  }
}

function sanitizeResult(result: ProviderLookupResult): Record<string, unknown> {
  if (result.outcome === "ISSUED") {
    return {
      outcome: result.outcome,
      providerOrderRef: result.providerOrderRef,
      issued: result.vouchers.length,
      providerVoucherRefs: result.vouchers.map((v) => v.providerVoucherRef),
      unitCostPaise: result.unitCostPaise,
    };
  }
  return result as unknown as Record<string, unknown>;
}

// ─── Per-item workflow ─────────────────────────────────────────────────

async function fulfilItem(ctx: Ctx): Promise<ItemOutcome> {
  const latest = await db.fulfilmentAttempt.findFirst({
    where: { orderItemId: ctx.item.id },
    orderBy: { attemptNumber: "desc" },
  });
  const attempt =
    latest ?? (ctx.allowPlace ? await openAttempt(ctx.item, 1) : null);
  if (!attempt)
    return { kind: "REVIEW", reason: "No fulfilment attempt exists yet" };

  switch (attempt.status) {
    case "ISSUED":
      return verifyIssued(ctx, attempt);
    case "PARTIAL":
      return {
        kind: "REVIEW",
        reason: "Provider issued fewer gift cards than ordered",
      };
    case "FAILED":
      return {
        kind: "FAILED",
        code: attempt.errorCode ?? "FAILED",
        message: attempt.errorMessage ?? "Provider failure",
      };
    case "REQUESTED":
      // placeCalls is incremented BEFORE calling, so 0 means the provider
      // has definitely never seen this reference.
      if (attempt.placeCalls === 0) {
        return ctx.allowPlace
          ? place(ctx, attempt)
          : { kind: "REVIEW", reason: "Attempt not yet sent" };
      }
      return lookup(ctx, attempt);
    default: // PENDING, UNKNOWN, NOT_FOUND
      if (
        ctx.allowPlace &&
        attempt.nextCheckAt &&
        attempt.nextCheckAt > new Date()
      ) {
        return { kind: "PENDING", nextCheckAt: attempt.nextCheckAt };
      }
      return lookup(ctx, attempt);
  }
}

async function verifyIssued(
  ctx: Ctx,
  attempt: FulfilmentAttempt,
): Promise<ItemOutcome> {
  const stored = await db.voucher.count({
    where: { fulfilmentAttemptId: attempt.id },
  });
  return stored >= ctx.item.quantity
    ? { kind: "ISSUED" }
    : {
        kind: "REVIEW",
        reason: `Only ${stored} of ${ctx.item.quantity} vouchers stored`,
      };
}

async function place(
  ctx: Ctx,
  attempt: FulfilmentAttempt,
): Promise<ItemOutcome> {
  // Commit the intent BEFORE the network call.
  const updated = await db.fulfilmentAttempt.update({
    where: { id: attempt.id },
    data: {
      placeCalls: { increment: 1 },
      status: "REQUESTED",
      requestedAt: new Date(),
    },
  });
  await audit({
    action: "PROVIDER_REQUESTED",
    entityType: "FulfilmentAttempt",
    entityId: attempt.id,
    orderId: ctx.orderId,
    actorType: "SYSTEM",
    data: {
      provider: ctx.provider.code,
      providerReference: attempt.providerReference,
      call: updated.placeCalls,
      quantity: ctx.item.quantity,
    },
  });
  log.info("fulfilment.place", {
    orderId: ctx.orderId,
    fulfilmentAttemptId: attempt.id,
    providerReference: attempt.providerReference,
    call: updated.placeCalls,
  });

  let result: ProviderOrderResult;
  try {
    result = await ctx.provider.placeOrder({
      providerReference: attempt.providerReference,
      productRef: ctx.item.providerProductRef,
      faceValuePaise: ctx.item.faceValuePaise,
      quantity: ctx.item.quantity,
      currency: ctx.item.currency,
    });
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    await db.fulfilmentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "UNKNOWN",
        errorCode: error.kind,
        errorMessage: error.message,
        respondedAt: new Date(),
      },
    });
    await audit({
      action: "PROVIDER_TIMEOUT",
      entityType: "FulfilmentAttempt",
      entityId: attempt.id,
      orderId: ctx.orderId,
      data: { kind: error.kind, providerReference: attempt.providerReference },
    });
    log.warn("fulfilment.ambiguous", {
      orderId: ctx.orderId,
      fulfilmentAttemptId: attempt.id,
      providerReference: attempt.providerReference,
      status: error.kind,
    });
    // NEVER re-order blindly: find out what actually happened.
    return lookup(
      ctx,
      await db.fulfilmentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      }),
    );
  }
  return applyResult(ctx, updated, result);
}

async function lookup(
  ctx: Ctx,
  attempt: FulfilmentAttempt,
): Promise<ItemOutcome> {
  if (!ctx.caps.statusLookup) {
    return {
      kind: "REVIEW",
      reason: "Provider can't confirm order status — check with the provider",
    };
  }
  const checked = await db.fulfilmentAttempt.update({
    where: { id: attempt.id },
    data: { statusChecks: { increment: 1 }, lastCheckedAt: new Date() },
  });

  let result: ProviderLookupResult;
  try {
    result = await ctx.provider.getOrderStatus(attempt.providerReference);
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    await audit({
      action: "PROVIDER_STATUS_CHECKED",
      entityType: "FulfilmentAttempt",
      entityId: attempt.id,
      orderId: ctx.orderId,
      data: { error: error.kind, check: checked.statusChecks },
    });
    if (checked.statusChecks >= MAX_STATUS_CHECKS) {
      return {
        kind: "REVIEW",
        reason: "Provider unreachable; order status unknown",
      };
    }
    const nextCheckAt = new Date(Date.now() + RECHECK_MS);
    await db.fulfilmentAttempt.update({
      where: { id: attempt.id },
      data: { nextCheckAt },
    });
    return { kind: "PENDING", nextCheckAt };
  }

  await audit({
    action: "PROVIDER_STATUS_CHECKED",
    entityType: "FulfilmentAttempt",
    entityId: attempt.id,
    orderId: ctx.orderId,
    data: {
      outcome: result.outcome,
      check: checked.statusChecks,
      providerReference: attempt.providerReference,
    },
  });

  if (result.outcome === "NOT_FOUND") {
    await db.fulfilmentAttempt.update({
      where: { id: attempt.id },
      data: { status: "NOT_FOUND", respondedAt: new Date() },
    });
    // Re-sending is safe ONLY with the same reference to a provider that
    // deduplicates on it.
    if (
      ctx.allowPlace &&
      ctx.caps.idempotentPlaceOrder &&
      checked.placeCalls < MAX_PLACE_CALLS
    ) {
      return place(ctx, checked);
    }
    return {
      kind: "REVIEW",
      reason: ctx.caps.idempotentPlaceOrder
        ? "Provider has no record of the order after retries"
        : "Provider has no record of the order and doesn't guarantee duplicate protection — confirm with the provider before retrying",
    };
  }
  return applyResult(ctx, checked, result);
}

async function applyResult(
  ctx: Ctx,
  attempt: FulfilmentAttempt,
  result: ProviderOrderResult,
): Promise<ItemOutcome> {
  if (result.outcome === "ISSUED") return storeVouchers(ctx, attempt, result);

  if (result.outcome === "PENDING") {
    const nextCheckAt = new Date(Date.now() + RECHECK_MS);
    await db.fulfilmentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "PENDING",
        providerOrderRef: result.providerOrderRef,
        respondedAt: new Date(),
        nextCheckAt,
        sanitizedResponse: sanitizeResult(result) as object,
      },
    });
    if (attempt.statusChecks >= MAX_STATUS_CHECKS) {
      return {
        kind: "REVIEW",
        reason: "Provider kept the order pending too long",
      };
    }
    return { kind: "PENDING", nextCheckAt };
  }

  await db.fulfilmentAttempt.update({
    where: { id: attempt.id },
    data: {
      status: "FAILED",
      providerOrderRef: result.providerOrderRef,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      respondedAt: new Date(),
      sanitizedResponse: sanitizeResult(result) as object,
    },
  });
  await audit({
    action: "PROVIDER_RESPONSE",
    entityType: "FulfilmentAttempt",
    entityId: attempt.id,
    orderId: ctx.orderId,
    data: { outcome: "FAILED", errorCode: result.errorCode },
  });
  return {
    kind: "FAILED",
    code: result.errorCode,
    message: result.errorMessage,
  };
}

async function storeVouchers(
  ctx: Ctx,
  attempt: FulfilmentAttempt,
  result: Extract<ProviderOrderResult, { outcome: "ISSUED" }>,
): Promise<ItemOutcome> {
  const wanted = ctx.item.quantity;
  const cards = result.vouchers.slice(0, wanted);
  const issuedAt = new Date();

  const stored = await db.$transaction(async (tx) => {
    // ON CONFLICT DO NOTHING: replaying the same result is a no-op, and a
    // provider voucher ref already stored elsewhere is never duplicated.
    await tx.voucher.createMany({
      skipDuplicates: true,
      data: cards.map((card, unitIndex) => ({
        orderItemId: ctx.item.id,
        fulfilmentAttemptId: attempt.id,
        providerId: ctx.item.providerId,
        providerVoucherRef: card.providerVoucherRef,
        unitIndex,
        codeEncrypted: encrypt(card.code),
        pinEncrypted: card.pin ? encrypt(card.pin) : null,
        codeLast4: card.code.slice(-4),
        keyVersion: KEY_VERSION,
        faceValuePaise: card.faceValuePaise,
        currency: ctx.item.currency,
        isTest: ctx.provider.isDemo,
        issuedAt,
        expiresAt: card.expiresAt ?? null,
      })),
    });
    const count = await tx.voucher.count({
      where: { fulfilmentAttemptId: attempt.id },
    });
    await tx.fulfilmentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: count >= wanted ? "ISSUED" : "PARTIAL",
        providerOrderRef: result.providerOrderRef,
        respondedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        nextCheckAt: null,
        sanitizedResponse: sanitizeResult(result) as object,
      },
    });
    if (count > 0) {
      await recordLedgerEntry(
        {
          orderId: ctx.orderId,
          fulfilmentAttemptId: attempt.id,
          type: "PROVIDER_COST",
          amountPaise:
            (result.unitCostPaise ?? ctx.item.costPricePaise) * count,
          currency: ctx.item.currency,
          dedupeKey: `provider-cost:${attempt.id}`,
          externalRef: result.providerOrderRef,
        },
        tx,
      );
    }
    await audit(
      {
        action: "VOUCHER_STORED",
        entityType: "FulfilmentAttempt",
        entityId: attempt.id,
        orderId: ctx.orderId,
        data: {
          stored: count,
          wanted,
          providerOrderRef: result.providerOrderRef,
          providerVoucherRefs: cards.map((c) => c.providerVoucherRef),
        },
      },
      tx,
    );
    return count;
  });

  if (stored < cards.length) {
    await recordIssue({
      type: "DUPLICATE_VOUCHER_REF",
      severity: "CRITICAL",
      dedupeKey: `DUPLICATE_VOUCHER_REF:${attempt.id}`,
      orderId: ctx.orderId,
      attemptId: attempt.id,
      details: { returned: cards.length, stored },
    });
  }
  if (cards.some((c) => c.faceValuePaise !== ctx.item.faceValuePaise)) {
    return {
      kind: "REVIEW",
      reason: "Provider returned a different face value than ordered",
    };
  }
  return stored >= wanted
    ? { kind: "ISSUED" }
    : {
        kind: "REVIEW",
        reason: `Provider issued ${stored} of ${wanted} gift cards`,
      };
}

// ─── Order-level workflow ──────────────────────────────────────────────

async function finishFulfilled(order: Order) {
  const user = await db.user.findUnique({ where: { id: order.userId } });
  if (!user) return;
  const sent = await notifyCustomer("GIFT_CARD_READY", user, {
    name: user.name,
    orderId: order.id,
  });
  if (sent) {
    await db.voucher.updateMany({
      where: { orderItem: { orderId: order.id }, deliveredAt: null },
      data: { deliveredAt: new Date() },
    });
  }
}

async function settleOrder(
  order: Order,
  outcomes: ItemOutcome[],
  lease: Lease,
): Promise<OrderStatus> {
  const review = outcomes.find((o) => o.kind === "REVIEW") as
    { reason: string } | undefined;
  const pending = outcomes.filter(
    (o): o is Extract<ItemOutcome, { kind: "PENDING" }> => o.kind === "PENDING",
  );
  const failed = outcomes.filter(
    (o): o is Extract<ItemOutcome, { kind: "FAILED" }> => o.kind === "FAILED",
  );
  const issuedCount = outcomes.filter((o) => o.kind === "ISSUED").length;
  const base = {
    orderId: order.id,
    from: "FULFILLING" as const,
    expectLease: lease.until,
  };

  if (issuedCount === outcomes.length) {
    await transitionOrder(db, {
      ...base,
      to: "FULFILLED",
      reason: "All vouchers issued",
    });
    await finishFulfilled(order);
    return "FULFILLED";
  }

  const toReview = async (reason: string) => {
    await transitionOrder(db, { ...base, to: "MANUAL_REVIEW", reason });
    await recordIssue({
      type: "FULFILMENT_REVIEW",
      severity: "HIGH",
      dedupeKey: `FULFILMENT_REVIEW:${order.id}`,
      orderId: order.id,
      details: { reason },
    });
    const user = await db.user.findUnique({ where: { id: order.userId } });
    if (user)
      await notifyCustomer("FULFILMENT_DELAYED", user, {
        name: user.name,
        orderId: order.id,
      });
    return "MANUAL_REVIEW" as const;
  };

  if (review) return toReview(review.reason);

  if (pending.length > 0) {
    const next = new Date(
      Math.min(...pending.map((p) => p.nextCheckAt.getTime())),
    );
    await parkOrder(db, lease, next, "Waiting for the provider");
    return "FULFILMENT_PENDING";
  }

  if (failed.length > 0 && issuedCount === 0) {
    if (failed.some((f) => f.code === "INSUFFICIENT_BALANCE")) {
      await recordIssue({
        type: "PROVIDER_BALANCE_LOW",
        severity: "CRITICAL",
        dedupeKey: `PROVIDER_BALANCE_LOW:${order.id}`,
        orderId: order.id,
        details: {
          message: "Provider rejected the order for insufficient balance",
        },
      });
      return toReview(
        "Provider balance insufficient — top up, then use 'Retry fulfilment'",
      );
    }
    const reason = `Provider could not issue: ${failed.map((f) => f.code).join(", ")}`;
    await transitionOrder(db, { ...base, to: "FULFILMENT_FAILED", reason });
    try {
      await startOrderRefund(order.id, "Gift card could not be issued", {
        type: "SYSTEM",
      });
      return (await db.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status;
    } catch (error) {
      log.error("fulfilment.refund_start_failed", { orderId: order.id, error });
      return "FULFILMENT_FAILED";
    }
  }

  return toReview("Order partially fulfilled");
}

/**
 * Processes one order if it's claimable (PAID, due FULFILMENT_PENDING, or
 * FULFILLING with a dead lease). Returns the resulting status, or null if
 * another processor holds it / nothing to do.
 */
export async function processOrder(
  orderId: string,
): Promise<OrderStatus | null> {
  let lease = await claimOrderForFulfilment(db, orderId, LEASE_MS);
  if (!lease) return null;

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  const outcomes: ItemOutcome[] = [];
  for (const item of order.items) {
    const provider = await providerFor(item.providerId);
    const caps = await provider.getCapabilities();
    outcomes.push(
      await fulfilItem({ provider, caps, item, orderId, allowPlace: true }),
    );
    const renewed = await renewLease(db, lease, LEASE_MS);
    if (!renewed) {
      // Someone took over (we were too slow). Stop; they'll redo lookups.
      log.warn("fulfilment.lease_lost", { orderId });
      return null;
    }
    lease = renewed;
  }
  return settleOrder(order, outcomes, lease);
}

/** Never throws — for after() / batch callers. */
export async function processOrderSafely(
  orderId: string,
): Promise<OrderStatus | null> {
  try {
    return await processOrder(orderId);
  } catch (error) {
    // The order stays FULFILLING; its lease expires and the next run
    // resumes from the committed attempt state.
    log.error("fulfilment.crashed", { orderId, error });
    return null;
  }
}

/**
 * Admin "Check provider status": status lookups ONLY (never places an
 * order). If every line turns out issued, a MANUAL_REVIEW order completes.
 */
export async function recoverOrderByLookup(
  orderId: string,
  actor: { type: ActorType; id?: string },
) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  if (order.status === "FULFILMENT_PENDING") {
    await db.order.updateMany({
      where: { id: orderId, status: "FULFILMENT_PENDING" },
      data: { nextCheckAt: new Date() },
    });
    return processOrder(orderId);
  }
  if (order.status !== "MANUAL_REVIEW") {
    throw new UserFacingError(
      `Lookup recovery applies to MANUAL_REVIEW orders (this one is ${order.status}).`,
    );
  }
  const outcomes: ItemOutcome[] = [];
  for (const item of order.items) {
    const provider = await providerFor(item.providerId);
    const caps = await provider.getCapabilities();
    outcomes.push(
      await fulfilItem({ provider, caps, item, orderId, allowPlace: false }),
    );
  }
  await audit({
    action: "ADMIN_ACTION",
    entityType: "Order",
    entityId: orderId,
    orderId,
    actorType: actor.type,
    actorId: actor.id,
    data: {
      action: "check_provider_status",
      outcomes: outcomes.map((o) => o.kind),
    },
  });
  if (outcomes.every((o) => o.kind === "ISSUED")) {
    const done = await transitionOrder(db, {
      orderId,
      from: "MANUAL_REVIEW",
      to: "FULFILLED",
      reason: "Vouchers recovered by provider status lookup",
      actor,
    });
    if (done) await finishFulfilled(order);
    return "FULFILLED" as const;
  }
  return order.status;
}

/**
 * Admin "Retry fulfilment" for a MANUAL_REVIEW order. Allowed ONLY for
 * lines whose provider status is definitively not-issued (FAILED, or
 * NOT_FOUND confirmed by lookup); each gets a NEW attempt with a NEW
 * reference. Anything ambiguous must be resolved by lookup first.
 */
export async function adminRetryFulfilment(
  orderId: string,
  actor: { type: ActorType; id?: string },
) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: {
        include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 1 } },
      },
    },
  });
  if (order.status !== "MANUAL_REVIEW")
    throw new UserFacingError("Only MANUAL_REVIEW orders can be retried.");

  const toRetry: OrderItem[] = [];
  for (const item of order.items) {
    const latest = item.attempts[0];
    if (!latest || latest.status === "ISSUED") continue;
    if (latest.status !== "FAILED" && latest.status !== "NOT_FOUND") {
      throw new UserFacingError(
        `Line ${item.productName} is ${latest.status} at the provider — run "Check provider status" first. Retrying an ambiguous order could issue twice.`,
      );
    }
    toRetry.push(item);
  }
  for (const item of toRetry) {
    const latest = (await db.fulfilmentAttempt.findFirst({
      where: { orderItemId: item.id },
      orderBy: { attemptNumber: "desc" },
    }))!;
    await openAttempt(item, latest.attemptNumber + 1);
  }
  const moved = await transitionOrder(db, {
    orderId,
    from: "MANUAL_REVIEW",
    to: "PAID",
    reason: "Admin retry after provider confirmed nothing was issued",
    actor,
  });
  if (!moved) throw new UserFacingError("Order changed — refresh.");
  return processOrderSafely(orderId);
}

/** Cron: processes claimable orders within a time budget. */
export async function runFulfilmentBatch(
  opts: { limit?: number; budgetMs?: number } = {},
) {
  const limit = opts.limit ?? 10;
  const deadline = Date.now() + (opts.budgetMs ?? 40_000);
  const now = new Date();
  const candidates = await db.order.findMany({
    where: {
      OR: [
        { status: "PAID" },
        {
          status: "FULFILMENT_PENDING",
          OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: now } }],
        },
        { status: "FULFILLING", leaseUntil: { lt: now } },
      ],
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  const results: Record<string, string | null> = {};
  for (const { id } of candidates) {
    if (Date.now() > deadline) break;
    results[id] = await processOrderSafely(id);
  }
  return { considered: candidates.length, results };
}
