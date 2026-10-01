"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGatewayById } from "@/lib/gateway";
import {
  MOCK_PENDING_MS,
  mockReturnUrl,
  mockStatus,
  type MockMeta,
  type MockOutcome,
} from "@/lib/gateway/mock";
import {
  CheckoutError,
  createOrderFromCart,
  reconcileOrder,
  retryOrderPayment,
} from "@/lib/orders";
import { rateLimit, tooManyAttempts } from "@/lib/rate-limit";

export interface CheckoutState {
  error?: string;
}

/**
 * Pay button: creates a PENDING order from the cart and sends the buyer to
 * the payment gateway's page. Nothing is charged or issued until the
 * gateway reports back (see /payment/return and the webhook).
 */
export async function startCheckoutAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fcheckout");

  const limit = rateLimit(`checkout:${user.id}`, 10, 10 * 60 * 1000);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfter) };

  let redirectUrl: string;
  try {
    ({ redirectUrl } = await createOrderFromCart(
      user,
      String(formData.get("paymentMethod")),
    ));
  } catch (error) {
    if (error instanceof CheckoutError) return { error: error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  redirect(redirectUrl);
}

/** "Retry payment" on a failed/cancelled order: new attempt, same amount. */
export async function retryPaymentAction(orderId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent(`/payment/status/${orderId}`)}`);

  let redirectUrl: string;
  try {
    redirectUrl = await retryOrderPayment(user, orderId);
  } catch (error) {
    if (error instanceof CheckoutError) {
      redirect(
        `/payment/status/${orderId}?error=${encodeURIComponent(error.message)}`,
      );
    }
    throw error;
  }
  redirect(redirectUrl);
}

/** Polled by the payment status page while an order is PENDING. */
export async function checkPaymentStatusAction(
  orderId: string,
): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== user.id) return null;
  if (order.status === "PENDING") {
    await reconcileOrder(orderId);
    return (
      (await db.order.findUnique({ where: { id: orderId } }))?.status ?? null
    );
  }
  return order.status;
}

/**
 * The mock gateway's own "Pay" handler — plays the gateway's server. Records
 * the tester's pick (as the gateway would in its DB) and redirects back to
 * our return URL with a signed result, like Razorpay/PayU do.
 */
export async function mockGatewayAction(
  gatewayPaymentId: string,
  outcome: MockOutcome,
): Promise<void> {
  const payment = await db.payment.findUnique({ where: { gatewayPaymentId } });
  if (!payment || payment.gateway !== "mock") redirect("/orders");
  getGatewayById("mock"); // throws if mock payments are disabled here

  const meta = JSON.parse(payment.meta) as MockMeta;
  if (payment.status !== "CREATED" || meta.outcome) {
    redirect(`/payment/status/${payment.orderId}`); // link already used
  }

  const next: MockMeta = {
    ...meta,
    outcome,
    ...(outcome.startsWith("pending")
      ? { resolveAt: Date.now() + MOCK_PENDING_MS }
      : {}),
  };
  await db.payment.update({
    where: { id: payment.id },
    data: { meta: JSON.stringify(next) },
  });
  redirect(
    mockReturnUrl(
      meta.returnUrl,
      mockStatus(gatewayPaymentId, payment.amount, next),
    ),
  );
}
