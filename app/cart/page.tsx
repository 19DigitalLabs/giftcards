import type { Metadata } from "next";
import Link from "next/link";
import { removeItemAction, setQuantityAction } from "@/lib/actions/cart";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { MAX_ORDER_FACE_VALUE_PAISE } from "@/lib/orders/checkout";
import { BrandChip } from "@/components/brand-chip";
import { buttonClasses, Card, Notice, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Cart" };

const stepButton =
  "size-8 rounded-full border border-border font-bold transition-colors hover:border-primary/60 hover:text-primary";

export default async function CartPage() {
  const user = await requireUser("/cart");
  const items = await db.cartItem.findMany({
    where: { userId: user.id },
    include: { product: { include: { brand: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (items.length === 0) {
    return (
      <Section className="text-center">
        <p className="text-6xl">🛒</p>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight">
          Your cart is empty
        </h1>
        <p className="mt-3 text-muted-foreground">
          Find a gift card from our brands to get started.
        </p>
        <Link
          href="/brands"
          className={`mt-7 inline-flex ${buttonClasses({ size: "lg" })}`}
        >
          Browse brands
        </Link>
      </Section>
    );
  }

  const lines = items.map((item) => {
    const p = item.product;
    const available =
      p.status === "ACTIVE" &&
      p.brand.status === "ACTIVE" &&
      p.sellingPricePaise != null;
    return {
      item,
      available,
      face: (p.faceValuePaise ?? 0) * item.quantity,
      pay: (p.sellingPricePaise ?? 0) * item.quantity,
      priceChanged: available && p.sellingPricePaise !== item.priceAtAddPaise,
    };
  });
  const face = lines.reduce((s, l) => s + (l.available ? l.face : 0), 0);
  const pay = lines.reduce((s, l) => s + (l.available ? l.pay : 0), 0);
  const blocked =
    lines.some((l) => !l.available) || face > MAX_ORDER_FACE_VALUE_PAISE;

  return (
    <Section>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Your cart
      </h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <ul className="space-y-4">
          {lines.map(({ item, available, pay: linePay, priceChanged }) => (
            <li
              key={item.id}
              className="rounded-3xl border border-border bg-card p-5"
            >
              <div className="flex flex-wrap items-center gap-4">
                <BrandChip
                  name={item.product.brand.name}
                  color={item.product.brand.color}
                  logoPath={item.product.brand.logoPath}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display font-extrabold">
                    {item.product.brand.name} ·{" "}
                    {formatINR(item.product.faceValuePaise ?? 0)}
                  </p>
                  {available ? (
                    <p className="text-xs text-muted-foreground">
                      You pay {formatINR(item.product.sellingPricePaise!)} each
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-pink">
                      This gift card is temporarily unavailable.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <form
                    action={setQuantityAction.bind(
                      null,
                      item.id,
                      item.quantity - 1,
                    )}
                  >
                    <button
                      aria-label="Decrease quantity"
                      className={stepButton}
                    >
                      −
                    </button>
                  </form>
                  <span className="w-6 text-center font-bold">
                    {item.quantity}
                  </span>
                  <form
                    action={setQuantityAction.bind(
                      null,
                      item.id,
                      item.quantity + 1,
                    )}
                  >
                    <button
                      aria-label="Increase quantity"
                      className={stepButton}
                    >
                      +
                    </button>
                  </form>
                </div>
                <p className="w-24 text-right font-display font-extrabold">
                  {available ? formatINR(linePay) : "—"}
                </p>
                <form action={removeItemAction.bind(null, item.id)}>
                  <button className="text-xs font-bold text-pink hover:underline">
                    Remove
                  </button>
                </form>
              </div>
              {priceChanged && (
                <p className="mt-3 text-xs text-orange">
                  The price changed since you added this (was{" "}
                  {formatINR(item.priceAtAddPaise)}). The current price applies.
                </p>
              )}
            </li>
          ))}
        </ul>

        <Card className="h-fit">
          <h2 className="font-display text-lg font-extrabold">Summary</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Gift card value</dt>
              <dd>{formatINR(face)}</dd>
            </div>
            {face - pay > 0 && (
              <div className="flex justify-between text-primary">
                <dt>Discount</dt>
                <dd>−{formatINR(face - pay)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 font-extrabold">
              <dt>Subtotal</dt>
              <dd>{formatINR(pay)}</dd>
            </div>
          </dl>
          {lines.some((l) => !l.available) && (
            <Notice variant="error" className="mt-4 text-xs">
              Remove unavailable gift cards to continue.
            </Notice>
          )}
          {face > MAX_ORDER_FACE_VALUE_PAISE && (
            <Notice variant="error" className="mt-4 text-xs">
              Orders are limited to {formatINR(MAX_ORDER_FACE_VALUE_PAISE)} of
              gift cards.
            </Notice>
          )}
          {blocked ? (
            <span
              className={`mt-6 w-full ${buttonClasses({ size: "lg", className: "pointer-events-none opacity-40" })}`}
            >
              Checkout
            </span>
          ) : (
            <Link
              href="/checkout"
              className={`mt-6 w-full ${buttonClasses({ size: "lg" })}`}
            >
              Checkout →
            </Link>
          )}
        </Card>
      </div>
    </Section>
  );
}
