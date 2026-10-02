import type { Prisma } from "@prisma/client";
import { db as defaultDb, type Db } from "./db";
import { sanitize } from "./log";

/*
 * Who did what to which record, for reconstructing any order's history.
 * Data is sanitised — never put voucher codes, passwords or tokens here.
 */

export type AuditAction =
  | "ORDER_CREATED"
  | "ORDER_STATE_CHANGED"
  | "PAYMENT_ATTEMPT_CREATED"
  | "PAYMENT_EVENT_RECEIVED"
  | "PAYMENT_VERIFIED"
  | "PAYMENT_MISMATCH"
  | "EXTRA_CAPTURE_DETECTED"
  | "FULFILMENT_STARTED"
  | "PROVIDER_REQUESTED"
  | "PROVIDER_RESPONSE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_STATUS_CHECKED"
  | "VOUCHER_STORED"
  | "VOUCHER_REVEALED"
  | "REFUND_STARTED"
  | "REFUND_COMPLETED"
  | "REFUND_FAILED"
  | "RECONCILIATION_ISSUE"
  | "CATALOGUE_SYNCED"
  | "ADMIN_ACTION"
  | "DEMO_CONTROL_CHANGED"
  | "SUPPORT_TICKET_CREATED"
  | "SUPPORT_TICKET_UPDATED";

export type ActorType =
  "SYSTEM" | "CUSTOMER" | "ADMIN" | "CRON" | "GATEWAY" | "PROVIDER";

export interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId: string;
  orderId?: string | null;
  actorType?: ActorType;
  actorId?: string | null;
  data?: Record<string, unknown>;
}

export async function audit(
  input: AuditInput,
  client: Db = defaultDb,
): Promise<void> {
  await client.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      orderId: input.orderId ?? null,
      actorType: input.actorType ?? "SYSTEM",
      actorId: input.actorId ?? null,
      data: input.data
        ? (sanitize(input.data) as Prisma.InputJsonValue)
        : undefined,
    },
  });
}
