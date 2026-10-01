"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { repriceBrand, syncCatalogue } from "@/lib/catalogue/sync";
import { giftCardProviderCode } from "@/lib/config";
import { db } from "@/lib/db";
import { publicMessage } from "@/lib/errors";
import {
  adminRetryFulfilment,
  recoverOrderByLookup,
} from "@/lib/fulfilment/service";
import { runScheduledWork } from "@/lib/jobs";
import { log } from "@/lib/log";
import { transitionOrder } from "@/lib/orders/state";
import { startOrderRefund } from "@/lib/payments/refunds";
import { refreshPayment } from "@/lib/payments/service";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveIssue } from "@/lib/reconciliation/issues";
import { runReconciliation } from "@/lib/reconciliation/service";

/*
 * Ops console actions. Every one: ADMIN role only, rate-limited, audited,
 * and routed through the same safe services the system uses — there is
 * deliberately NO "issue voucher again" action.
 */

async function adminAction(
  name: string,
  back: string,
  target: { entityType: string; entityId: string; orderId?: string },
  fn: (adminId: string) => Promise<unknown>,
): Promise<never> {
  const admin = await requireAdmin(back);
  let message: string;
  try {
    await enforceRateLimit(`admin:${admin.id}`, 120, 60 * 1000);
    const result = await fn(admin.id);
    await audit({
      action: "ADMIN_ACTION",
      entityType: target.entityType,
      entityId: target.entityId,
      orderId: target.orderId,
      actorType: "ADMIN",
      actorId: admin.id,
      data: { action: name },
    });
    message = typeof result === "string" ? result : `${name}: done`;
  } catch (error) {
    log.warn("admin.action_failed", { event: name, error });
    message = `${name} failed: ${publicMessage(error)}`;
  }
  revalidatePath("/admin", "layout");
  const sep = back.includes("?") ? "&" : "?";
  redirect(`${back}${sep}msg=${encodeURIComponent(message)}`);
}

export async function adminCheckPaymentAction(
  orderId: string,
  paymentId: string,
) {
  return adminAction(
    "Check payment status",
    `/admin/orders/${orderId}`,
    { entityType: "Payment", entityId: paymentId, orderId },
    async () => {
      const outcome = await refreshPayment(paymentId, "ADMIN");
      return `Gateway check: ${outcome}`;
    },
  );
}

export async function adminCheckProviderAction(orderId: string) {
  return adminAction(
    "Check provider status",
    `/admin/orders/${orderId}`,
    { entityType: "Order", entityId: orderId, orderId },
    async (adminId) => {
      const status = await recoverOrderByLookup(orderId, {
        type: "ADMIN",
        id: adminId,
      });
      return `Provider lookup done — order is ${status ?? "unchanged"}`;
    },
  );
}

export async function adminRetryFulfilmentAction(orderId: string) {
  return adminAction(
    "Retry fulfilment",
    `/admin/orders/${orderId}`,
    { entityType: "Order", entityId: orderId, orderId },
    async (adminId) => {
      const status = await adminRetryFulfilment(orderId, {
        type: "ADMIN",
        id: adminId,
      });
      return `Fulfilment retried — order is ${status ?? "queued"}`;
    },
  );
}

export async function adminRefundAction(orderId: string) {
  return adminAction(
    "Refund order",
    `/admin/orders/${orderId}`,
    { entityType: "Order", entityId: orderId, orderId },
    async (adminId) => {
      const refund = await startOrderRefund(
        orderId,
        "Refund initiated by admin",
        { type: "ADMIN", id: adminId },
      );
      return `Refund ${refund.status}`;
    },
  );
}

export async function adminManualReviewAction(
  orderId: string,
  formData: FormData,
) {
  const reason =
    String(formData.get("reason") ?? "")
      .trim()
      .slice(0, 200) || "Flagged by admin";
  return adminAction(
    "Move to manual review",
    `/admin/orders/${orderId}`,
    { entityType: "Order", entityId: orderId, orderId },
    async (adminId) => {
      const moved = await transitionOrder(db, {
        orderId,
        from: [
          "PAYMENT_PENDING",
          "PAYMENT_FAILED",
          "CANCELLED",
          "PAID",
          "FULFILMENT_PENDING",
          "FULFILMENT_FAILED",
          "REFUND_PENDING",
          "FULFILLED",
        ],
        to: "MANUAL_REVIEW",
        reason,
        actor: { type: "ADMIN", id: adminId },
      });
      return moved
        ? "Moved to manual review"
        : "Order can't move to manual review from its current state";
    },
  );
}

export async function adminSetBrandDisabledAction(
  brandId: string,
  disabled: boolean,
) {
  return adminAction(
    disabled ? "Disable brand" : "Enable brand",
    "/admin/catalogue",
    { entityType: "Brand", entityId: brandId },
    async () => {
      const brand = await db.brand.findUniqueOrThrow({
        where: { id: brandId },
      });
      await db.brand.update({
        where: { id: brandId },
        data: {
          adminDisabled: disabled,
          status: disabled ? "DISABLED" : brand.providerStatus,
        },
      });
    },
  );
}

export async function adminSetProductDisabledAction(
  productId: string,
  disabled: boolean,
) {
  return adminAction(
    disabled ? "Disable product" : "Enable product",
    "/admin/catalogue",
    { entityType: "Product", entityId: productId },
    async () => {
      const product = await db.product.findUniqueOrThrow({
        where: { id: productId },
      });
      await db.product.update({
        where: { id: productId },
        data: {
          adminDisabled: disabled,
          status: disabled ? "DISABLED" : product.providerStatus,
        },
      });
    },
  );
}

export async function adminSetBrandDiscountAction(
  brandId: string,
  formData: FormData,
) {
  const bps = Math.round(Number(formData.get("discountBps")));
  return adminAction(
    "Change brand discount",
    "/admin/catalogue",
    { entityType: "Brand", entityId: brandId },
    async () => {
      if (!Number.isInteger(bps) || bps < 0 || bps > 2000)
        throw new Error("Discount must be 0–2000 bps");
      await db.brand.update({
        where: { id: brandId },
        data: { discountBps: bps },
      });
      const n = await repriceBrand(brandId);
      return `Discount set to ${bps} bps; ${n} products repriced (existing orders unchanged)`;
    },
  );
}

export async function adminSetUserBlockedAction(
  userId: string,
  blocked: boolean,
) {
  return adminAction(
    blocked ? "Block user" : "Unblock user",
    "/admin/users",
    { entityType: "User", entityId: userId },
    async (adminId) => {
      if (userId === adminId) throw new Error("You can't block yourself");
      await db.user.update({
        where: { id: userId },
        data: { status: blocked ? "BLOCKED" : "ACTIVE" },
      });
      if (blocked) await db.session.deleteMany({ where: { userId } });
    },
  );
}

export async function adminSyncCatalogueAction() {
  return adminAction(
    "Sync catalogue",
    "/admin/catalogue",
    { entityType: "Provider", entityId: giftCardProviderCode() },
    async (adminId) => {
      const s = await syncCatalogue(giftCardProviderCode(), {
        type: "ADMIN",
        id: adminId,
      });
      return `Synced: ${s.brandsCreated + s.brandsUpdated} brands, ${s.productsCreated} new / ${s.productsUpdated} updated / ${s.productsDelisted} delisted products`;
    },
  );
}

export async function adminRunReconciliationAction() {
  return adminAction(
    "Run reconciliation",
    "/admin/reconciliation",
    { entityType: "Reconciliation", entityId: "manual" },
    async () => {
      const s = await runReconciliation("ADMIN");
      return `Reconciliation: ${s.paymentsChecked} payments, ${s.ordersChecked} attempts checked; ${s.issuesOpened} new issues; ${s.autoApplied} missed captures applied`;
    },
  );
}

export async function adminRunProcessorAction() {
  return adminAction(
    "Run processor",
    "/admin",
    { entityType: "Jobs", entityId: "manual" },
    async () => {
      const s = await runScheduledWork(40_000);
      return `Processor ran: ${s.fulfilment} orders considered, ${s.payments.checked} payments polled, ${s.refunds} refunds retried`;
    },
  );
}

export async function adminResolveIssueAction(issueId: string) {
  return adminAction(
    "Resolve issue",
    "/admin/reconciliation",
    { entityType: "ReconciliationIssue", entityId: issueId },
    async () => {
      const issue = await db.reconciliationIssue.findUniqueOrThrow({
        where: { id: issueId },
      });
      await resolveIssue(issue.dedupeKey);
    },
  );
}
