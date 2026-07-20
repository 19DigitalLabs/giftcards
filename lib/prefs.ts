import { cookies } from "next/headers";
import { getSessionUser } from "./auth";
import { getPaymentMethod, PAYMENT_METHODS, type PaymentMethod } from "./payments";

/**
 * The buyer's remembered payment method: cookie first (their latest pick,
 * works for guests too), then the user row, then UPI.
 */
export async function getPreferredMethod(): Promise<PaymentMethod> {
  const cookieId = (await cookies()).get("gifts19_paymethod")?.value;
  const user = await getSessionUser();
  const id = cookieId ?? user?.preferredPaymentMethod ?? "upi";
  return getPaymentMethod(id) ?? PAYMENT_METHODS[0]!;
}
