import type { OrderStatus, Prisma } from "@prisma/client";
import { audit, type ActorType } from "../audit";
import type { Db } from "../db";
import { log } from "../log";

/*
 * THE order state machine. This module is the only code allowed to write
 * Order.status (a test greps the codebase to enforce it). Every write is a
 * conditional UPDATE ("…WHERE status IN (allowed predecessors)"), so two
 * concurrent writers can never both move an order — the loser gets `false`.
 *
 *   PAYMENT_PENDING ─verified capture─▶ PAID ─claim─▶ FULFILLING ─▶ FULFILLED
 *        │  ▲                                  │   ▲        │
 *        │  └─retry─ PAYMENT_FAILED/CANCELLED   │   │        ├─▶ FULFILMENT_PENDING (provider pending /
 *        ├─▶ PAYMENT_FAILED  (late capture ─▶ PAID)         │       ambiguous → status lookup later)
 *        └─▶ CANCELLED       (late capture ─▶ PAID)         ├─▶ FULFILMENT_FAILED ─▶ REFUND_PENDING ─▶ REFUNDED
 *                                                           └─▶ MANUAL_REVIEW
 *   MANUAL_REVIEW ─▶ REFUND_PENDING | PAID (admin safe retry after provider
 *                    confirmed nothing was issued) | FULFILLED (lookup
 *                    recovered the vouchers)
 */

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PAYMENT_PENDING: ["PAID", "PAYMENT_FAILED", "CANCELLED", "MANUAL_REVIEW"],
  PAYMENT_FAILED: ["PAYMENT_PENDING", "PAID", "MANUAL_REVIEW"],
  CANCELLED: ["PAYMENT_PENDING", "PAID", "MANUAL_REVIEW"],
  PAID: ["FULFILLING", "MANUAL_REVIEW"],
  FULFILLING: [
    "FULFILLED",
    "FULFILMENT_PENDING",
    "FULFILMENT_FAILED",
    "MANUAL_REVIEW",
  ],
  FULFILMENT_PENDING: ["FULFILLING", "MANUAL_REVIEW"],
  FULFILMENT_FAILED: ["REFUND_PENDING", "MANUAL_REVIEW"],
  MANUAL_REVIEW: ["REFUND_PENDING", "PAID", "FULFILLED"],
  REFUND_PENDING: ["REFUNDED", "MANUAL_REVIEW"],
  FULFILLED: ["MANUAL_REVIEW"],
  REFUNDED: [],
};

/** Statuses after a verified capture (money is with us). */
export const PAID_STATUSES: readonly OrderStatus[] = [
  "PAID",
  "FULFILLING",
  "FULFILMENT_PENDING",
  "FULFILLED",
  "FULFILMENT_FAILED",
  "MANUAL_REVIEW",
  "REFUND_PENDING",
  "REFUNDED",
];

/** Statuses before any capture. */
export const UNPAID_STATUSES: readonly OrderStatus[] = [
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "CANCELLED",
];

const ENTERED_AT: Partial<
  Record<OrderStatus, keyof Prisma.OrderUpdateManyMutationInput>
> = {
  PAID: "paidAt",
  FULFILLED: "fulfilledAt",
  PAYMENT_FAILED: "failedAt",
  FULFILMENT_FAILED: "failedAt",
  MANUAL_REVIEW: "manualReviewAt",
  REFUND_PENDING: "refundStartedAt",
  REFUNDED: "refundedAt",
  CANCELLED: "cancelledAt",
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export interface TransitionInput {
  orderId: string;
  from: OrderStatus | readonly OrderStatus[];
  to: OrderStatus;
  reason?: string;
  actor?: { type: ActorType; id?: string | null };
  /** Only for transitions out of FULFILLING: the caller's lease token. */
  expectLease?: Date;
  /** Non-status fields to set in the same write (e.g. capturedPaymentId). */
  set?: Prisma.OrderUpdateManyMutationInput;
  data?: Record<string, unknown>;
}

/**
 * Moves an order `from` → `to` if (and only if) it's currently in `from`.
 * Returns false when another writer got there first. Throws on a transition
 * the state machine doesn't allow — that's a programming error.
 */
export async function transitionOrder(
  client: Db,
  input: TransitionInput,
): Promise<boolean> {
  const froms = (
    Array.isArray(input.from) ? input.from : [input.from]
  ) as OrderStatus[];
  for (const from of froms) {
    if (!canTransition(from, input.to)) {
      throw new Error(`Illegal order transition ${from} → ${input.to}`);
    }
  }

  const now = new Date();
  const enteredAt = ENTERED_AT[input.to];
  const leavingLease = froms.includes("FULFILLING");
  const { count } = await client.order.updateMany({
    where: {
      id: input.orderId,
      status: { in: froms },
      ...(input.expectLease ? { leaseUntil: input.expectLease } : {}),
    },
    data: {
      ...input.set,
      status: input.to,
      statusReason: input.reason ?? null,
      ...(enteredAt ? { [enteredAt]: now } : {}),
      ...(leavingLease && input.to !== "FULFILLING"
        ? { leaseUntil: null }
        : {}),
    },
  });
  if (count === 0) return false;

  await audit(
    {
      action: "ORDER_STATE_CHANGED",
      entityType: "Order",
      entityId: input.orderId,
      orderId: input.orderId,
      actorType: input.actor?.type ?? "SYSTEM",
      actorId: input.actor?.id,
      data: { from: froms, to: input.to, reason: input.reason, ...input.data },
    },
    client,
  );
  log.info("order.transition", {
    orderId: input.orderId,
    from: froms.join("|"),
    status: input.to,
  });
  return true;
}

export interface Lease {
  orderId: string;
  until: Date;
}

/**
 * Claims an order for fulfilment processing: PAID → FULFILLING, or a
 * FULFILMENT_PENDING order that's due a re-check, or a FULFILLING order
 * whose previous processor died (lease expired). Returns the lease, or null
 * if someone else holds it. Only the lease holder may talk to the provider
 * for this order.
 */
export async function claimOrderForFulfilment(
  client: Db,
  orderId: string,
  leaseMs: number,
): Promise<Lease | null> {
  const now = new Date();
  const until = new Date(now.getTime() + leaseMs);

  // Fresh claim from PAID.
  if (
    await transitionOrder(client, {
      orderId,
      from: "PAID",
      to: "FULFILLING",
      set: { leaseUntil: until, fulfilmentStartedAt: now, nextCheckAt: null },
    })
  ) {
    return { orderId, until };
  }

  // Due re-check of a pending/ambiguous order (not audited each time — the
  // attempts record every provider interaction).
  const recheck = await client.order.updateMany({
    where: {
      id: orderId,
      status: "FULFILMENT_PENDING",
      OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: now } }],
    },
    data: { status: "FULFILLING", leaseUntil: until, nextCheckAt: null },
  });
  if (recheck.count === 1) return { orderId, until };

  // Take over from a processor that crashed mid-flight.
  const takeover = await client.order.updateMany({
    where: { id: orderId, status: "FULFILLING", leaseUntil: { lt: now } },
    data: { leaseUntil: until },
  });
  if (takeover.count === 1) {
    log.warn("order.lease_takeover", { orderId });
    await audit(
      {
        action: "FULFILMENT_STARTED",
        entityType: "Order",
        entityId: orderId,
        orderId,
        data: { staleLeaseTakeover: true },
      },
      client,
    );
    return { orderId, until };
  }
  return null;
}

/** Extends a held lease; returns the new lease or null if it was lost. */
export async function renewLease(
  client: Db,
  lease: Lease,
  leaseMs: number,
): Promise<Lease | null> {
  const until = new Date(Date.now() + leaseMs);
  const { count } = await client.order.updateMany({
    where: { id: lease.orderId, status: "FULFILLING", leaseUntil: lease.until },
    data: { leaseUntil: until },
  });
  return count === 1 ? { orderId: lease.orderId, until } : null;
}

/** Gives up a lease without changing state (e.g. nothing to do yet). */
export async function parkOrder(
  client: Db,
  lease: Lease,
  nextCheckAt: Date,
  reason: string,
): Promise<boolean> {
  return transitionOrder(client, {
    orderId: lease.orderId,
    from: "FULFILLING",
    to: "FULFILMENT_PENDING",
    expectLease: lease.until,
    reason,
    set: { nextCheckAt },
  });
}
