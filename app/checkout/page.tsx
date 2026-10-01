import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatRupee } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPreferredMethod } from "@/lib/prefs";
import { CheckoutForm } from "@/components/checkout-form";
import { Card, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const items = await db.cartItem.findMany({
    where: { userId: user.id },
    include: { brand: true },
    orderBy: { id: "asc" },
  });
  if (items.length === 0) redirect("/cart");
  const method = await getPreferredMethod();

  const subtotal = items.reduce((s, i) => s + i.denomination * i.quantity, 0);
  const baseCashback = items.reduce(
    (s, i) => s + (i.denomination * i.quantity * i.brand.cashbackPct) / 100,
    0,
  );

  return (
    <Section>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Almost there 🏁
      </h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_26rem]">
        <Card className="h-fit">
          <h2 className="font-display text-lg font-extrabold">Order summary</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  {item.brand.name} · {formatRupee(item.denomination)} ×{" "}
                  {item.quantity}
                  <span className="ml-2 text-primary">
                    {item.brand.cashbackPct}% cb
                  </span>
                </span>
                <span className="font-bold">
                  {formatRupee(item.denomination * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-border pt-4 text-sm font-extrabold">
            <span>Face value</span>
            <span>{formatRupee(subtotal)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Fee and final Gems depend on the payment method you pick →
          </p>
        </Card>

        <Card className="h-fit">
          <h2 className="font-display text-lg font-extrabold">Payment</h2>
          <div className="mt-4">
            <CheckoutForm
              subtotal={subtotal}
              baseCashback={baseCashback}
              initialMethodId={method.id}
            />
          </div>
        </Card>
      </div>
    </Section>
  );
}
