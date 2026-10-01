"use client";

import { useState } from "react";
import { cn, formatRupee } from "@/lib/utils";
import { addToCartAction } from "@/lib/actions/cart";
import { formatGems, MAX_QTY } from "@/lib/giftcards";
import { SubmitButton } from "@/components/submit-button";

interface MethodView {
  label: string;
  emoji: string;
  feePct: number;
  cashbackFactor: number;
}

/** Denomination + quantity picker that posts to the add-to-cart action. */
export function AddToCartForm({
  brandId,
  denominations,
  cashbackPct,
  method,
}: {
  brandId: string;
  denominations: number[];
  cashbackPct: number;
  /** The buyer's selected payment method — set in the picker alongside. */
  method: MethodView;
}) {
  const [denomination, setDenomination] = useState(denominations[0] ?? 0);
  const [quantity, setQuantity] = useState(1);

  const total = denomination * quantity;
  const gems = Math.round((total * cashbackPct * method.cashbackFactor) / 100);
  const fee = Math.round((total * method.feePct) / 100);

  return (
    <form action={addToCartAction}>
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="denomination" value={denomination} />
      <input type="hidden" name="quantity" value={quantity} />

      <p className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
        Card value
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {denominations.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDenomination(value)}
            aria-pressed={value === denomination}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-bold transition-all",
              value === denomination
                ? "border-primary bg-primary text-primary-foreground shadow-glow"
                : "border-border hover:border-primary/60 hover:text-primary",
            )}
          >
            {formatRupee(value)}
          </button>
        ))}
      </div>

      <p className="mt-6 text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
        Quantity
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          className="size-10 rounded-full border border-border font-bold transition-colors hover:border-primary/60 hover:text-primary"
        >
          −
        </button>
        <span className="w-6 text-center font-display text-lg font-extrabold">
          {quantity}
        </span>
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={() => setQuantity((q) => Math.min(MAX_QTY, q + 1))}
          className="size-10 rounded-full border border-border font-bold transition-colors hover:border-primary/60 hover:text-primary"
        >
          +
        </button>
        <span className="text-xs text-muted-foreground">max {MAX_QTY}</span>
      </div>

      <div className="mt-6 space-y-1.5 rounded-2xl bg-muted p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">You pay (face value)</span>
          <span className="font-display text-xl font-extrabold">
            {formatRupee(total)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {method.emoji} {method.label} fee
          </span>
          <span className={fee > 0 ? "font-bold text-pink" : "font-bold"}>
            {fee > 0 ? `+ ${formatRupee(fee)}` : "Free"}
          </span>
        </div>
        <div className="flex justify-between text-primary">
          <span className="font-bold">Earn 💎</span>
          <span className="font-bold">{formatGems(gems)}</span>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          1 Gem = ₹1. Numbers follow your payment pick — change it in the list
          alongside.
        </p>
      </div>

      <SubmitButton size="lg" className="mt-5 w-full" pendingLabel="Adding…">
        Add to cart 🛒
      </SubmitButton>
    </form>
  );
}
