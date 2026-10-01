import type { Metadata } from "next";
import Link from "next/link";
import { formatRupee } from "@/lib/utils";
import { removeItemAction, setQuantityAction } from "@/lib/actions/cart";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatGems } from "@/lib/giftcards";
import { convenienceFee, methodCashback } from "@/lib/payments";
import { getPreferredMethod } from "@/lib/prefs";
import { BrandChip } from "@/components/brand-chip";
import { buttonClasses, Card, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Cart" };

const stepButton =
  "size-8 rounded-full border border-border font-bold transition-colors hover:border-primary/60 hover:text-primary";

export default async function CartPage() {
  const user = await requireUser("/cart");
  const items = await db.cartItem.findMany({
    where: { userId: user.id },
    include: { brand: true },
    orderBy: { id: "asc" },
  });

  const method = await getPreferredMethod();
  const subtotal = items.reduce((s, i) => s + i.denomination * i.quantity, 0);
  const baseCashback = items.reduce(
    (s, i) => s + (i.denomination * i.quantity * i.brand.cashbackPct) / 100,
    0,
  );
  const gems = methodCashback(baseCashback, method);
  const fee = convenienceFee(subtotal, method);

  if (items.length === 0) {
    return (
      <Section className="text-center">
        <p className="text-6xl">🛒</p>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight">
          Cart&apos;s looking empty
        </h1>
        <p className="mt-3 text-muted-foreground">
          Gem-earning gift cards are literally one search away.
        </p>
        <Link
          href="/brands"
          className={`mt-7 inline-flex ${buttonClasses({ size: "lg" })}`}
        >
          Browse brands ✨
        </Link>
      </Section>
    );
  }

  return (
    <Section>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Your cart
      </h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <ul className="space-y-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-4 rounded-3xl border border-border bg-card p-5"
            >
              <BrandChip
                name={item.brand.name}
                color={item.brand.color}
                slug={item.brand.slug}
              />
              <div className="min-w-0 flex-1">
                <p className="font-display font-extrabold">
                  {item.brand.name} · {formatRupee(item.denomination)}
                </p>
                <p className="text-xs text-primary">
                  💎 earns up to {item.brand.cashbackPct}% back in Gems
                </p>
              </div>
              <div className="flex items-center gap-2">
                <form action={setQuantityAction.bind(null, item.id, item.quantity - 1)}>
                  <button aria-label="Decrease quantity" className={stepButton}>
                    −
                  </button>
                </form>
                <span className="w-6 text-center font-bold">{item.quantity}</span>
                <form action={setQuantityAction.bind(null, item.id, item.quantity + 1)}>
                  <button aria-label="Increase quantity" className={stepButton}>
                    +
                  </button>
                </form>
              </div>
              <p className="w-24 text-right font-display font-extrabold">
                {formatRupee(item.denomination * item.quantity)}
              </p>
              <form action={removeItemAction.bind(null, item.id)}>
                <button className="text-xs font-bold text-pink hover:underline">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>

        <Card className="h-fit">
          <h2 className="font-display text-lg font-extrabold">Order summary</h2>
          <p className="mt-3 rounded-2xl bg-muted px-4 py-2.5 text-xs font-bold">
            Paying via {method.emoji} {method.label}
          </p>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Face value</dt>
              <dd>{formatRupee(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Convenience fee</dt>
              <dd className={fee > 0 ? "text-pink" : ""}>
                {fee > 0 ? `+ ${formatRupee(fee)}` : "Free"}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-extrabold">
              <dt>You pay</dt>
              <dd>{formatRupee(subtotal + fee)}</dd>
            </div>
            <div className="flex justify-between text-primary">
              <dt className="font-bold">Gems to earn 💎</dt>
              <dd className="font-bold">{formatGems(gems)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            1 Gem = ₹1, credited to your wallet. You can switch the payment
            method at checkout.
          </p>
          <Link
            href="/checkout"
            className={`mt-6 w-full ${buttonClasses({ size: "lg" })}`}
          >
            Checkout →
          </Link>
        </Card>
      </div>
    </Section>
  );
}
