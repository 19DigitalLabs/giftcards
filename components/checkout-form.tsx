"use client";

import { useActionState, useState } from "react";
import { cn, formatRupee } from "@/lib/utils";
import {
  startCheckoutAction,
  type CheckoutState,
} from "@/lib/actions/checkout";
import { setPaymentMethodAction } from "@/lib/actions/prefs";
import { formatGems } from "@/lib/giftcards";
import {
  convenienceFee,
  methodCashback,
  PAYMENT_METHODS,
} from "@/lib/payments";
import { SubmitButton } from "@/components/submit-button";
import { Notice } from "@/components/ui";

/**
 * Payment step. Picking a method changes the convenience fee and cashback
 * (UPI = free + full rate, like Zingoy/Maximize/OnPoints). Paying creates a
 * pending order and hands off to the payment gateway's page.
 */
export function CheckoutForm({
  subtotal,
  baseCashback,
  initialMethodId,
  blockedReason,
}: {
  subtotal: number;
  /** Cashback at the full/UPI rate, unrounded. */
  baseCashback: number;
  /** The method remembered from the brand page picker. */
  initialMethodId: string;
  /** Set when the order can't be placed (e.g. over the order limit). */
  blockedReason?: string;
}) {
  const [methodId, setMethodId] = useState(initialMethodId);
  const [state, formAction] = useActionState<CheckoutState, FormData>(
    startCheckoutAction,
    {},
  );
  const method =
    PAYMENT_METHODS.find((m) => m.id === methodId) ?? PAYMENT_METHODS[0]!;

  const fee = convenienceFee(subtotal, method);
  const cashback = methodCashback(baseCashback, method);
  const total = subtotal + fee;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="paymentMethod" value={method.id} />

      <Notice variant="info" className="text-xs">
        🧪 Test mode — you&apos;ll go to a mock payment page standing in for the
        real gateway (Razorpay/PayU), where you pick success, pending or
        failure. No real money moves.
      </Notice>

      <div>
        <p className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
          Pay with
        </p>
        <div className="mt-2 space-y-2">
          {PAYMENT_METHODS.map((m) => {
            const mFee = convenienceFee(subtotal, m);
            const mCashback = methodCashback(baseCashback, m);
            const selected = m.id === methodId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMethodId(m.id);
                  void setPaymentMethodAction(m.id); // keep cart/brand pages in sync
                }}
                aria-pressed={selected}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-2xl border p-3.5 text-left text-sm transition-all",
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50",
                )}
              >
                <span className="min-w-0">
                  <span className="block font-bold">
                    {m.emoji} {m.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {mFee > 0 ? `+${formatRupee(mFee)} fee` : "No fee ✅"} ·
                    earn {formatGems(mCashback)} 💎
                  </span>
                </span>
                <span
                  className={cn(
                    "size-4 shrink-0 rounded-full border-2",
                    selected ? "border-primary bg-primary" : "border-border",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      <dl className="space-y-2 rounded-2xl bg-muted p-4 text-sm">
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
        <div className="flex justify-between border-t border-border pt-2 text-base font-extrabold">
          <dt>You pay</dt>
          <dd>{formatRupee(total)}</dd>
        </div>
        <div className="flex justify-between text-primary">
          <dt className="font-bold">Gems to wallet 💎</dt>
          <dd className="font-bold">{formatGems(cashback)}</dd>
        </div>
        <p className="text-xs text-muted-foreground">1 Gem = ₹1.</p>
      </dl>

      {blockedReason && <Notice variant="error">{blockedReason}</Notice>}
      {state.error && <Notice variant="error">{state.error}</Notice>}

      <SubmitButton
        size="lg"
        className="w-full"
        disabled={Boolean(blockedReason)}
        pendingLabel="Taking you to payment…"
      >
        Pay {formatRupee(total)} →
      </SubmitButton>
    </form>
  );
}
