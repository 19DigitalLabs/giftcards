"use client";

import { useState } from "react";
import { cn, formatRupee } from "@/lib/utils";
import { payAction } from "@/lib/actions/checkout";
import { setPaymentMethodAction } from "@/lib/actions/prefs";
import { formatGems } from "@/lib/giftcards";
import {
  convenienceFee,
  methodCashback,
  PAYMENT_METHODS,
} from "@/lib/payments";
import { SubmitButton } from "@/components/submit-button";

/**
 * Dummy payment step. Picking a payment method changes the convenience fee
 * and cashback (UPI = free + full rate, like Zingoy/Maximize/OnPoints).
 * The radio at the bottom picks which outcome the simulated gateway returns.
 */
export function CheckoutForm({
  subtotal,
  baseCashback,
  initialMethodId,
}: {
  subtotal: number;
  /** Cashback at the full/UPI rate, unrounded. */
  baseCashback: number;
  /** The method remembered from the brand page picker. */
  initialMethodId: string;
}) {
  const [methodId, setMethodId] = useState(initialMethodId);
  const method = PAYMENT_METHODS.find((m) => m.id === methodId) ?? PAYMENT_METHODS[0]!;

  const fee = convenienceFee(subtotal, method);
  const cashback = methodCashback(baseCashback, method);
  const total = subtotal + fee;

  return (
    <form action={payAction} className="space-y-4">
      <input type="hidden" name="paymentMethod" value={method.id} />

      <p className="rounded-2xl border border-accent-soft-border bg-accent-soft px-4 py-3 text-xs font-bold text-accent-foreground">
        🧪 Demo checkout — no real money moves. Payment is simulated in place
        of a third-party gateway (Razorpay/PayU) to be integrated later.
      </p>

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
                    {mFee > 0 ? `+${formatRupee(mFee)} fee` : "No fee ✅"} · earn{" "}
                    {formatGems(mCashback)} 💎
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

      <fieldset className="rounded-2xl border border-border p-4 text-sm">
        <legend className="px-2 text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
          Simulate gateway response
        </legend>
        <label className="flex items-center gap-2 font-bold">
          <input
            type="radio"
            name="outcome"
            value="success"
            defaultChecked
            className="accent-primary"
          />
          Payment succeeds ✅
        </label>
        <label className="mt-2 flex items-center gap-2 font-bold">
          <input type="radio" name="outcome" value="failure" className="accent-pink" />
          Payment fails ❌
        </label>
      </fieldset>

      <SubmitButton size="lg" className="w-full" pendingLabel="Processing payment…">
        Pay {formatRupee(total)} →
      </SubmitButton>
    </form>
  );
}
