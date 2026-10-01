import type { LedgerEntryType } from "@prisma/client";
import { db as defaultDb, type Db } from "./db";
import { assertPaise, CURRENCY } from "./money";

/*
 * Append-only money trail. Entries are never updated or deleted (a Postgres
 * trigger enforces it); a correction is a new entry. Signs: + is money to
 * us, − is money out. Each real-world event books exactly once thanks to
 * `dedupeKey` — replaying a webhook can't double-count a capture.
 */

export interface LedgerInput {
  orderId: string;
  type: LedgerEntryType;
  amountPaise: number;
  dedupeKey: string;
  currency?: string;
  paymentId?: string;
  refundId?: string;
  fulfilmentAttemptId?: string;
  externalRef?: string;
  memo?: string;
}

const SIGN: Record<LedgerEntryType, 1 | -1> = {
  PAYMENT_CAPTURED: 1,
  PAYMENT_REFUNDED: -1,
  PROVIDER_COST: -1,
  PROVIDER_COST_REVERSED: 1,
};

/** Books an entry once; returns false if `dedupeKey` was already booked. */
export async function recordLedgerEntry(
  input: LedgerInput,
  client: Db = defaultDb,
): Promise<boolean> {
  const magnitude = Math.abs(assertPaise(input.amountPaise));
  // ON CONFLICT DO NOTHING: safe inside a transaction (a caught unique
  // violation would abort a Postgres transaction).
  const { count } = await client.ledgerEntry.createMany({
    skipDuplicates: true,
    data: {
      orderId: input.orderId,
      type: input.type,
      amountPaise: SIGN[input.type] * magnitude,
      currency: input.currency ?? CURRENCY,
      dedupeKey: input.dedupeKey,
      paymentId: input.paymentId,
      refundId: input.refundId,
      fulfilmentAttemptId: input.fulfilmentAttemptId,
      externalRef: input.externalRef,
      memo: input.memo,
    },
  });
  return count === 1;
}

/** Net money position of an order (+ = we're up). */
export async function orderNetPaise(
  orderId: string,
  client: Db = defaultDb,
): Promise<number> {
  const sum = await client.ledgerEntry.aggregate({
    _sum: { amountPaise: true },
    where: { orderId },
  });
  return sum._sum.amountPaise ?? 0;
}
