import type { Prisma } from "@prisma/client";
import { audit } from "../audit";
import { db as defaultDb, type Db } from "../db";
import { log, sanitize } from "../log";

export type IssueSeverity = "CRITICAL" | "HIGH" | "MEDIUM";

export type IssueType =
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_CURRENCY_MISMATCH"
  | "PAYMENT_IDENTITY_MISMATCH"
  | "DOUBLE_CAPTURE"
  | "CAPTURED_NOT_PAID"
  | "GATEWAY_STATE_MISMATCH"
  | "STUCK_PAYMENT"
  | "STUCK_FULFILMENT"
  | "FULFILMENT_REVIEW"
  | "PROVIDER_ISSUED_LOCAL_MISSING"
  | "FULFILLED_MISSING_AT_PROVIDER"
  | "ORPHAN_PROVIDER_ORDER"
  | "DUPLICATE_PROVIDER_ORDER"
  | "DUPLICATE_VOUCHER_REF"
  | "REFUND_FAILED"
  | "PROVIDER_BALANCE_LOW";

export interface IssueInput {
  type: IssueType;
  severity: IssueSeverity;
  /** Stable identity of the discrepancy, e.g. "DOUBLE_CAPTURE:<paymentId>". */
  dedupeKey: string;
  orderId?: string;
  paymentId?: string;
  attemptId?: string;
  details?: Record<string, unknown>;
}

/**
 * Opens (or refreshes) a reconciliation issue. Issues are for humans — we
 * record discrepancies, we never silently "fix" money problems.
 */
export async function recordIssue(
  input: IssueInput,
  client: Db = defaultDb,
): Promise<void> {
  const details = input.details
    ? (sanitize(input.details) as Prisma.InputJsonValue)
    : undefined;
  // One atomic upsert (ON CONFLICT) — safe inside a caller's transaction.
  const before = await client.reconciliationIssue.findUnique({
    where: { dedupeKey: input.dedupeKey },
    select: { status: true },
  });
  await client.reconciliationIssue.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {
      lastSeenAt: new Date(),
      details,
      status: "OPEN",
      resolvedAt: null,
    },
    create: {
      type: input.type,
      severity: input.severity,
      dedupeKey: input.dedupeKey,
      orderId: input.orderId,
      paymentId: input.paymentId,
      attemptId: input.attemptId,
      details,
    },
  });
  if (before?.status === "OPEN") return; // already known
  log.warn("reconciliation.issue", {
    event: input.type,
    orderId: input.orderId,
    paymentId: input.paymentId,
  });
  if (input.orderId) {
    await audit(
      {
        action: "RECONCILIATION_ISSUE",
        entityType: "ReconciliationIssue",
        entityId: input.dedupeKey,
        orderId: input.orderId,
        data: { type: input.type, severity: input.severity },
      },
      client,
    );
  }
}

export async function resolveIssue(
  dedupeKey: string,
  client: Db = defaultDb,
): Promise<void> {
  await client.reconciliationIssue.updateMany({
    where: { dedupeKey, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
}
