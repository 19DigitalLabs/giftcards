import {
  applyBps,
  assertPaise,
  calculateDiscount,
  calculateMargin,
  type Paise,
} from "./money";

/*
 * Pricing policy — OUR business rules, separate from provider data.
 *
 *   discount      = faceValue × discountBps      (brand default, product override)
 *   sellingPrice  = faceValue − discount
 *   never sell below provider cost + MIN_MARGIN; never above face value.
 *
 * Computed on the server at catalogue sync / admin change, and snapshotted
 * onto each OrderItem at checkout — later price changes never touch history.
 */

/** Smallest gross margin we'll accept per unit (0 = break-even allowed). */
export const MIN_MARGIN_PAISE = 0;

export interface PriceInput {
  faceValuePaise: Paise;
  costPricePaise: Paise;
  discountBps: number;
}

export interface Price {
  faceValuePaise: Paise;
  sellingPricePaise: Paise;
  discountPaise: Paise;
  costPricePaise: Paise;
  marginPaise: Paise;
}

export function computePrice({
  faceValuePaise,
  costPricePaise,
  discountBps,
}: PriceInput): Price {
  assertPaise(faceValuePaise, "faceValue");
  assertPaise(costPricePaise, "cost");
  const bps = Math.max(0, Math.min(discountBps, 10_000));
  let selling = faceValuePaise - applyBps(faceValuePaise, bps);
  selling = Math.max(selling, costPricePaise + MIN_MARGIN_PAISE); // margin floor
  selling = Math.min(selling, faceValuePaise); // never charge above face value
  return {
    faceValuePaise,
    sellingPricePaise: selling,
    discountPaise: calculateDiscount(faceValuePaise, selling),
    costPricePaise,
    marginPaise: calculateMargin(selling, costPricePaise),
  };
}

/** Line totals for `quantity` units at a unit price. */
export function lineTotals(
  unit: Pick<
    Price,
    "faceValuePaise" | "sellingPricePaise" | "discountPaise" | "costPricePaise"
  >,
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity < 1)
    throw new Error("quantity must be a positive integer");
  return {
    faceValuePaise: unit.faceValuePaise * quantity,
    sellingPricePaise: unit.sellingPricePaise * quantity,
    discountPaise: unit.discountPaise * quantity,
    costPricePaise: unit.costPricePaise * quantity,
  };
}
