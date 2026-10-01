"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, publicMessage } from "@/lib/errors";
import { processOrderSafely } from "@/lib/fulfilment/service";
import { log } from "@/lib/log";
import { startCheckout } from "@/lib/orders/checkout";
import { refreshPayment, retryOrderPayment } from "@/lib/payments/service";
import { rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { revealVoucher, type RevealedVoucher } from "@/lib/vouchers";

export interface CheckoutState {
  error?: string;
}

/**
 * Pay button. Idempotent on the form's checkoutKey: a double click or
 * retried request lands on the same order and payment.
 */
export async function startCheckoutAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fcheckout");

  const limit = await rateLimit(`checkout:${user.id}`, 20, 10 * 60 * 1000);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfter) };

  let redirectUrl: string;
  try {
    ({ redirectUrl } = await startCheckout(
      user,
      String(formData.get("checkoutKey") ?? ""),
    ));
  } catch (error) {
    if (!(error instanceof AppError))
      log.error("checkout.unexpected", { error });
    return { error: publicMessage(error) };
  }
  revalidatePath("/", "layout");
  redirect(redirectUrl);
}

/** "Try again" on a failed/cancelled payment: a new attempt, same order. */
export async function retryPaymentAction(orderId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent(`/payment/status/${orderId}`)}`);
  let redirectUrl: string;
  try {
    redirectUrl = await retryOrderPayment(user.id, orderId, {
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    redirect(
      `/payment/status/${orderId}?error=${encodeURIComponent(publicMessage(error))}`,
    );
  }
  redirect(redirectUrl);
}

/**
 * Polled by the order status page while payment or fulfilment is in
 * progress: asks the gateway about open payments and nudges fulfilment.
 * Returns the order's status.
 */
export async function checkOrderProgressAction(
  orderId: string,
): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      payments: { where: { status: { in: ["CREATED", "PENDING"] } } },
    },
  });
  if (!order || order.userId !== user.id) return null;

  const limit = await rateLimit(`progress:${user.id}`, 60, 60 * 1000);
  if (!limit.ok) return order.status;

  if (order.status === "PAYMENT_PENDING") {
    for (const p of order.payments)
      await refreshPayment(p.id, "CUSTOMER").catch(() => undefined);
  }
  const fresh = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (fresh.status === "PAID" || fresh.status === "FULFILMENT_PENDING") {
    after(() => processOrderSafely(orderId));
  }
  return fresh.status;
}

export interface RevealState {
  voucher?: RevealedVoucher;
  error?: string;
}

/** Decrypts ONE voucher for its owner; rate-limited and audited. */
export async function revealVoucherAction(
  _prev: RevealState,
  formData: FormData,
): Promise<RevealState> {
  const user = await getSessionUser();
  if (!user) return { error: "Please sign in again." };
  try {
    return {
      voucher: await revealVoucher(
        user.id,
        String(formData.get("voucherId") ?? ""),
      ),
    };
  } catch (error) {
    return { error: publicMessage(error) };
  }
}
