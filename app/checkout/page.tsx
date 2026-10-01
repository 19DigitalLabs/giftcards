import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { convenienceFeeBps, isDemoMode } from "@/lib/config";
import { db } from "@/lib/db";
import { applyBps, formatINR } from "@/lib/money";
import { newCheckoutKey } from "@/lib/orders/checkout";
import { CheckoutForm } from "@/components/checkout-form";
import { ResendVerificationForm } from "@/components/resend-verification-form";
import { Card, Notice, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const items = await db.cartItem.findMany({
    where: { userId: user.id },
    include: { product: { include: { brand: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (items.length === 0) redirect("/cart");
  const unavailable = items.some(
    (i) => i.product.status !== "ACTIVE" || i.product.brand.status !== "ACTIVE",
  );
  if (unavailable) redirect("/cart");

  const face = items.reduce(
    (s, i) => s + (i.product.faceValuePaise ?? 0) * i.quantity,
    0,
  );
  const selling = items.reduce(
    (s, i) => s + (i.product.sellingPricePaise ?? 0) * i.quantity,
    0,
  );
  const fee = applyBps(selling, convenienceFeeBps());
  const total = selling + fee;

  return (
    <Section>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Checkout
      </h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_26rem]">
        <Card className="h-fit">
          <h2 className="font-display text-lg font-extrabold">Order summary</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  {item.product.brand.name} gift card ·{" "}
                  {formatINR(item.product.faceValuePaise ?? 0)} ×{" "}
                  {item.quantity}
                </span>
                <span className="font-bold">
                  {formatINR(
                    (item.product.faceValuePaise ?? 0) * item.quantity,
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Your gift card codes appear on your order page once issued.{" "}
            <Link href="/support" className="underline">
              Need help?
            </Link>
          </p>
        </Card>

        <Card className="h-fit">
          <h2 className="font-display text-lg font-extrabold">Payment</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Gift card value</dt>
              <dd>{formatINR(face)}</dd>
            </div>
            <div className="flex justify-between text-primary">
              <dt>Discount</dt>
              <dd>−{formatINR(face - selling)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Payment fee</dt>
              <dd>{fee > 0 ? formatINR(fee) : "₹0"}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-3 text-base font-extrabold">
              <dt>You pay</dt>
              <dd>{formatINR(total)}</dd>
            </div>
          </dl>
          <div className="mt-6">
            {user.emailVerifiedAt ? (
              <CheckoutForm
                checkoutKey={newCheckoutKey()}
                payLabel={`Pay ${formatINR(total)}`}
                isDemo={isDemoMode()}
              />
            ) : (
              <div className="space-y-3">
                <Notice variant="error">
                  Please verify your email address ({user.email}) before buying
                  a gift card.
                </Notice>
                <ResendVerificationForm />
              </div>
            )}
          </div>
        </Card>
      </div>
    </Section>
  );
}
