/*
 * The contract every payment gateway adapter implements (demo today;
 * Razorpay / Cashfree / PayU later). Adapters ONLY translate between the
 * gateway's API and these shapes — authentication, request/response
 * mapping, signature checks. Business rules (what a capture means for an
 * order, refunds policy, fulfilment) live in PaymentService, which never
 * knows which gateway it's talking to.
 *
 * Hosted-checkout flow:
 *   createPayment → buyer pays on the gateway's page → gateway redirects
 *   back (verifyReturn) AND sends a webhook (parseWebhook). Neither is
 *   trusted alone: the return only identifies the payment, and we confirm
 *   its state server-to-server with getPaymentStatus before acting.
 */

export type GatewayPaymentStatus =
  "CREATED" | "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

/** A payment as the gateway reports it. */
export interface GatewayPaymentState {
  gatewayPaymentId: string;
  /** Our Payment.id, echoed back by the gateway (identity check). */
  merchantRef: string;
  status: GatewayPaymentStatus;
  /** Amount the gateway captured (SUCCEEDED) or was asked for. */
  amountPaise: number;
  currency: string;
  failureReason?: string;
}

export interface GatewayEvent {
  /** The gateway's own event id — our dedupe key. */
  externalEventId: string;
  eventType: string;
  payment: GatewayPaymentState;
  /** Event payload safe to store (no card data, no secrets). */
  sanitizedPayload: Record<string, unknown>;
}

export interface CreatePaymentInput {
  /** Our Payment.id — the gateway must treat it as idempotent. */
  merchantRef: string;
  orderRef: string;
  amountPaise: number;
  currency: string;
  customer: { name: string; email: string };
  /** Absolute URL the gateway sends the buyer back to. */
  returnUrl: string;
}

export interface CreatedPayment {
  gatewayPaymentId: string;
  /** The gateway's hosted payment page. */
  redirectUrl: string;
}

export interface RefundInput {
  gatewayPaymentId: string;
  amountPaise: number;
  currency: string;
  /** Ours; the gateway must not refund twice for the same key. */
  idempotencyKey: string;
  reason: string;
}

export interface RefundResult {
  status: "SUCCEEDED" | "PENDING" | "FAILED";
  gatewayRefundId?: string;
  failureReason?: string;
}

export interface PaymentGateway {
  readonly code: string;
  readonly isDemo: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  getPaymentStatus(gatewayPaymentId: string): Promise<GatewayPaymentState>;
  /** Authenticates the buyer's return redirect; null if tampered/expired. */
  verifyReturn(params: URLSearchParams): { gatewayPaymentId: string } | null;
  /** Verifies + parses a webhook; null if the signature is invalid. */
  parseWebhook(rawBody: string, headers: Headers): GatewayEvent | null;
  refund(input: RefundInput): Promise<RefundResult>;
  getRefundStatus(gatewayRefundId: string): Promise<RefundResult>;
}

/** Thrown by adapters when the gateway can't be reached / errors. */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}
