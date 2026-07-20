"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { convenienceFee, getPaymentMethod, methodCashback } from "@/lib/payments";

/** A dummy voucher code, e.g. "MYNT-8F2A-C41D-90BE". */
function voucherCode(brandName: string): string {
  const prefix = brandName.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
  const hex = randomBytes(6).toString("hex").toUpperCase();
  return `${prefix}-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/**
 * Simulated payment gateway. The buyer pays face value + the chosen payment
 * method's convenience fee, and earns that method's cashback rate. Success
 * records a COMPLETED order (voucher codes, cart cleared); failure records a
 * FAILED one (no codes, no cashback, cart kept).
 */
export async function payAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fcheckout");

  const items = await db.cartItem.findMany({
    where: { userId: user.id },
    include: { brand: true },
  });
  if (items.length === 0) redirect("/cart");

  const method = getPaymentMethod(String(formData.get("paymentMethod")));
  if (!method) redirect("/checkout");

  const success = formData.get("outcome") !== "failure";

  let subtotal = 0;
  let baseCashback = 0;
  for (const item of items) {
    const face = item.denomination * item.quantity;
    subtotal += face;
    baseCashback += (face * item.brand.cashbackPct) / 100;
  }
  const fee = convenienceFee(subtotal, method);
  const cashback = success ? methodCashback(baseCashback, method) : 0;

  const orderId = `GC-${randomBytes(4).toString("hex").toUpperCase()}`;
  await db.order.create({
    data: {
      id: orderId,
      userId: user.id,
      status: success ? "COMPLETED" : "FAILED",
      subtotal,
      fee,
      total: subtotal + fee,
      cashback,
      paymentMethod: method.id,
      paymentRef: `PAY-${randomBytes(6).toString("hex").toUpperCase()}`,
      items: {
        create: items.map((item) => ({
          brandId: item.brandId,
          brandName: item.brand.name,
          denomination: item.denomination,
          quantity: item.quantity,
          cashbackPct: item.brand.cashbackPct,
          codes: JSON.stringify(
            success
              ? Array.from({ length: item.quantity }, () => voucherCode(item.brand.name))
              : [],
          ),
        })),
      },
    },
  });

  if (success) {
    await db.cartItem.deleteMany({ where: { userId: user.id } });
  }

  revalidatePath("/", "layout");
  redirect(`/orders/${orderId}`);
}
