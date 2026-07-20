/*
 * Payment methods, modeled on how Indian gift card stores (Zingoy, Maximize,
 * OnPoints, GyFTR) price them: UPI is free and earns the full cashback rate;
 * cards and netbanking carry a convenience fee and a trimmed cashback rate
 * (the gateway's MDR eats into the margin).
 */

export interface PaymentMethod {
  id: string;
  label: string;
  note: string;
  emoji: string;
  /** Convenience fee, % of order value (fees go to the gateway). */
  feePct: number;
  /** Portion of the brand's base cashback rate this method earns. */
  cashbackFactor: number;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "upi",
    label: "UPI",
    note: "GPay, PhonePe, Paytm — full cashback, zero fee",
    emoji: "📱",
    feePct: 0,
    cashbackFactor: 1,
  },
  {
    id: "rupay-cc",
    label: "RuPay Credit Card on UPI",
    note: "Credit card linked to UPI",
    emoji: "💳",
    feePct: 1,
    cashbackFactor: 0.9,
  },
  {
    id: "debit-card",
    label: "Debit Card",
    note: "All banks",
    emoji: "🏧",
    feePct: 0.9,
    cashbackFactor: 0.9,
  },
  {
    id: "credit-card",
    label: "Credit Card",
    note: "Visa, Mastercard, Amex",
    emoji: "💳",
    feePct: 1.5,
    cashbackFactor: 0.8,
  },
  {
    id: "netbanking",
    label: "Net Banking",
    note: "All major banks",
    emoji: "🏦",
    feePct: 0.5,
    cashbackFactor: 0.85,
  },
];

export function getPaymentMethod(id: string): PaymentMethod | undefined {
  return PAYMENT_METHODS.find((m) => m.id === id);
}

/** Brand cashback % as actually earned via this method, e.g. 10 → 8. */
export function effectiveCashbackPct(brandPct: number, method: PaymentMethod): number {
  return Math.round(brandPct * method.cashbackFactor * 10) / 10;
}

/** Convenience fee in rupees on an order of `amount`. */
export function convenienceFee(amount: number, method: PaymentMethod): number {
  return Math.round((amount * method.feePct) / 100);
}

/** Cashback in rupees: `baseCashback` (at UPI rate) scaled to the method. */
export function methodCashback(baseCashback: number, method: PaymentMethod): number {
  return Math.round(baseCashback * method.cashbackFactor);
}
