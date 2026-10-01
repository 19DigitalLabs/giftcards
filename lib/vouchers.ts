import { audit } from "./audit";
import { decrypt } from "./crypto";
import { db } from "./db";
import { ForbiddenError, NotFoundError } from "./errors";
import { enforceRateLimit } from "./rate-limit";

/*
 * Voucher secrets are never rendered into pages. The order page shows
 * "•••• 1234"; the code is decrypted one voucher at a time, on an explicit
 * request from the owning customer, rate-limited and audited.
 */

export interface RevealedVoucher {
  voucherId: string;
  code: string;
  pin: string | null;
  isTest: boolean;
}

export function maskCode(last4: string): string {
  return `•••• •••• ${last4}`;
}

export async function revealVoucher(
  userId: string,
  voucherId: string,
): Promise<RevealedVoucher> {
  await enforceRateLimit(`reveal:${userId}`, 30, 10 * 60 * 1000);

  const voucher = await db.voucher.findUnique({
    where: { id: voucherId },
    include: {
      orderItem: {
        include: {
          order: { select: { id: true, userId: true, status: true } },
        },
      },
    },
  });
  if (!voucher) throw new NotFoundError("Voucher");
  const order = voucher.orderItem.order;
  if (order.userId !== userId) {
    await audit({
      action: "VOUCHER_REVEALED",
      entityType: "Voucher",
      entityId: voucherId,
      orderId: order.id,
      actorType: "CUSTOMER",
      actorId: userId,
      data: { denied: true },
    });
    throw new ForbiddenError({ voucherId });
  }
  if (
    voucher.status !== "ACTIVE" ||
    (order.status !== "FULFILLED" && order.status !== "MANUAL_REVIEW")
  ) {
    throw new ForbiddenError({ voucherId, reason: "not_available" });
  }

  const code = decrypt(voucher.codeEncrypted);
  const pin = voucher.pinEncrypted ? decrypt(voucher.pinEncrypted) : null;
  await db.voucher.update({
    where: { id: voucherId },
    data: { revealedAt: voucher.revealedAt ?? new Date() },
  });
  await audit({
    action: "VOUCHER_REVEALED",
    entityType: "Voucher",
    entityId: voucherId,
    orderId: order.id,
    actorType: "CUSTOMER",
    actorId: userId,
    data: { last4: voucher.codeLast4 },
  });
  return { voucherId, code, pin, isTest: voucher.isTest };
}
