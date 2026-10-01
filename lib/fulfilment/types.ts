/*
 * The contract every gift-card provider adapter implements: the demo
 * provider today, PineLabsGiftCardProvider (or others) once their official
 * API documentation is available.
 *
 * An adapter's ONLY job: authentication, request/response mapping, error
 * mapping, status lookup and catalogue mapping. It knows nothing about
 * checkout, payments, customers, pricing, refunds or order states — those
 * live in FulfilmentService and friends.
 *
 * The result types are deliberately explicit about certainty, because we
 * don't yet know how a real provider behaves:
 *   ISSUED     vouchers exist (possibly fewer than asked = partial)
 *   PENDING    provider accepted; vouchers later
 *   FAILED     DEFINITIVE: nothing was issued, safe to refund
 *   NOT_FOUND  (lookup only) provider has no order for that reference
 *   ProviderError (thrown)  outcome UNKNOWN — timeout, network, garbage
 */

export interface ProviderCapabilities {
  /** Re-sending placeOrder with the same reference returns the original order. */
  idempotentPlaceOrder: boolean;
  /** getOrderStatus(reference) is supported. */
  statusLookup: boolean;
  /** getBalance() is supported (prefunded accounts). */
  balance: boolean;
  /** listOrdersSince() is supported (reconciliation). */
  orderListing: boolean;
}

export interface ProviderVoucher {
  providerVoucherRef: string;
  code: string;
  pin?: string;
  faceValuePaise: number;
  expiresAt?: Date;
}

export type ProviderOrderResult =
  | {
      outcome: "ISSUED";
      providerOrderRef: string;
      vouchers: ProviderVoucher[];
      /** What the provider debited us per unit, if it says. */
      unitCostPaise?: number;
    }
  | { outcome: "PENDING"; providerOrderRef: string }
  | {
      outcome: "FAILED";
      providerOrderRef?: string;
      errorCode: string;
      errorMessage: string;
    };

export type ProviderLookupResult =
  ProviderOrderResult | { outcome: "NOT_FOUND" };

export type ProviderErrorKind =
  "TIMEOUT" | "UNAVAILABLE" | "MALFORMED_RESPONSE" | "UNKNOWN";

/** The call's outcome is UNKNOWN — the provider may or may not have acted. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface PlaceOrderRequest {
  /** Ours, unique per attempt — the idempotency key. */
  providerReference: string;
  productRef: string;
  faceValuePaise: number;
  quantity: number;
  currency: string;
}

export interface ProviderBrand {
  brandRef: string;
  name: string;
  category: string;
  description: string;
  color: string;
  logoPath?: string;
  status: "ACTIVE" | "DISABLED" | "OUT_OF_STOCK";
  terms: string[];
  howToRedeem: string[];
  validityMonths: number;
  featured: boolean;
  /** Seed hint for our default discount (demo only). */
  suggestedDiscountBps?: number;
}

export interface ProviderProduct {
  productRef: string;
  brandRef: string;
  faceValuePaise: number;
  costPaise: number;
  currency: string;
  status: "ACTIVE" | "DISABLED" | "OUT_OF_STOCK";
}

export interface ProviderCatalogue {
  brands: ProviderBrand[];
  products: ProviderProduct[];
}

export interface ProviderOrderSummary {
  providerReference: string;
  providerOrderRef: string;
  status: "PENDING" | "ISSUED" | "FAILED";
  quantity: number;
  issuedCount: number;
  createdAt: Date;
}

export interface GiftCardProvider {
  /** Matches Provider.code in the DB, e.g. "DEMO". */
  readonly code: string;
  readonly name: string;
  readonly isDemo: boolean;
  getCapabilities(): Promise<ProviderCapabilities>;
  getCatalogue(): Promise<ProviderCatalogue>;
  placeOrder(request: PlaceOrderRequest): Promise<ProviderOrderResult>;
  getOrderStatus(providerReference: string): Promise<ProviderLookupResult>;
  getBalance?(): Promise<{ availablePaise: number; currency: string }>;
  listOrdersSince?(since: Date): Promise<ProviderOrderSummary[]>;
}
