"use client";

import { useState } from "react";
import { addToCartAction } from "@/lib/actions/cart";
import { MAX_QTY } from "@/lib/giftcards";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/components/submit-button";

export interface ProductOption {
  id: string;
  faceValuePaise: number;
  sellingPricePaise: number;
}

/**
 * Denomination + quantity picker. Prices shown here are for display only —
 * the server re-reads them at checkout.
 */
export function AddToCartForm({ products }: { products: ProductOption[] }) {
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const selected = products.find((p) => p.id === selectedId) ?? products[0];
  if (!selected) return null;

  const value = selected.faceValuePaise * quantity;
  const pay = selected.sellingPricePaise * quantity;
  const save = value - pay;

  return (
    <form action={addToCartAction}>
      <input type="hidden" name="productId" value={selected.id} />
      <input type="hidden" name="quantity" value={quantity} />

      <p className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
        Gift card value
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedId(p.id)}
            aria-pressed={p.id === selected.id}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-bold transition-all",
              p.id === selected.id
                ? "border-primary bg-primary text-primary-foreground shadow-glow"
                : "border-border hover:border-primary/60 hover:text-primary",
            )}
          >
            {formatINR(p.faceValuePaise)}
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

      <dl className="mt-6 space-y-1.5 rounded-2xl bg-muted p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Gift card value</dt>
          <dd>{formatINR(value)}</dd>
        </div>
        {save > 0 && (
          <div className="flex justify-between text-primary">
            <dt className="font-bold">You save</dt>
            <dd className="font-bold">{formatINR(save)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2 text-base font-extrabold">
          <dt>You pay</dt>
          <dd>{formatINR(pay)}</dd>
        </div>
      </dl>

      <SubmitButton size="lg" className="mt-5 w-full" pendingLabel="Adding…">
        Add to cart
      </SubmitButton>
    </form>
  );
}
