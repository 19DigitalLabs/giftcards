/*
 * Money helpers. Every amount is an integer number of paise (₹1 = 100
 * paise); every rate is integer basis points (1% = 100 bps). No floats ever
 * touch stored money: percentages are applied with integer arithmetic and
 * explicit half-up rounding.
 */

export type Paise = number;

export const CURRENCY = "INR";

export function assertPaise(value: number, label = "amount"): Paise {
  if (!Number.isSafeInteger(value))
    throw new Error(`${label} must be an integer number of paise.`);
  return value;
}

/** ₹ whole rupees → paise (only for literals/config, never user input math). */
export function rupees(amount: number): Paise {
  return assertPaise(Math.round(amount * 100), "rupees");
}

/** `amount × bps / 10000`, rounded half-up, in integer arithmetic. */
export function applyBps(amount: Paise, bps: number): Paise {
  assertPaise(amount);
  if (!Number.isInteger(bps)) throw new Error("bps must be an integer.");
  const scaled = amount * bps; // < 2^53 for any realistic gift-card amount
  const sign = scaled < 0 ? -1 : 1;
  return (sign * Math.floor((Math.abs(scaled) + 5000) / 10000)) as Paise;
}

/** Customer discount on a unit: face value minus what they pay. */
export function calculateDiscount(
  faceValue: Paise,
  sellingPrice: Paise,
): Paise {
  return assertPaise(faceValue - sellingPrice);
}

/** Gross margin before gateway fees/taxes: what they pay minus our cost. */
export function calculateMargin(sellingPrice: Paise, costPrice: Paise): Paise {
  return assertPaise(sellingPrice - costPrice);
}

/** Margin as bps of the selling price (for admin display). */
export function marginBps(sellingPrice: Paise, costPrice: Paise): number {
  if (sellingPrice <= 0) return 0;
  return Math.round(
    (calculateMargin(sellingPrice, costPrice) * 10000) / sellingPrice,
  );
}

/**
 * "₹1,000", "₹990.50", "-₹10". Drops ".00" for whole rupees, which is how
 * Indian e-commerce displays prices.
 */
export function formatINR(amount: Paise): string {
  assertPaise(amount);
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const rupeesPart = Math.floor(abs / 100);
  const paisePart = abs % 100;
  const grouped = new Intl.NumberFormat("en-IN").format(rupeesPart);
  const text =
    paisePart === 0
      ? `₹${grouped}`
      : `₹${grouped}.${String(paisePart).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

/** "2.5%" from 250 bps. */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, "")}%`;
}
