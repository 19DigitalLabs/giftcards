/*
 * The contract every payment gateway adapter implements. It follows the
 * hosted-checkout flow Razorpay / PayU / Cashfree all use:
 *
 *   1. createPayment  — register the payment, get a URL to send the buyer to
 *   2. buyer pays on the gateway's page, gets redirected to our return URL
 *      with a signed result          → verifyReturn
 *   3. gateway also calls our webhook → verifyWebhook (the source of truth)
 *   4. for payments still pending we can ask for the latest → fetchStatus
 *
 * Adding a real gateway = one new file implementing this + an entry in
 * lib/gateway/index.ts. Nothing in orders/checkout changes.
 */

export type GatewayStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";

export const GATEWAY_STATUSES: readonly GatewayStatus[] = [
  "PENDING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
];

/** A payment's state as reported by the gateway. */
export interface GatewayUpdate {
  gatewayPaymentId: string;
  status: GatewayStatus;
  /** Rupees the gateway says this payment is for — must match our record. */
  amount: number;
  failureReason?: string;
}

export interface CreatePaymentInput {
  orderId: string;
  /** Rupees to collect. */
  amount: number;
  /** Payment method id from lib/payments.ts, to preselect on the gateway page. */
  method: string;
  customer: { name: string; email: string };
  /** Absolute URL the gateway sends the buyer back to. */
  returnUrl: string;
}

export interface CreatedPayment {
  gatewayPaymentId: string;
  /** Where to send the buyer to pay (the gateway's hosted page). */
  redirectUrl: string;
  /** Adapter-specific data to keep on the Payment row. */
  meta?: Record<string, unknown>;
}

export interface PaymentGateway {
  id: string;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  /** Parses + verifies the signed params on the buyer's return redirect. */
  verifyReturn(params: URLSearchParams): GatewayUpdate | null;
  /** Parses + verifies a server-to-server webhook call. */
  verifyWebhook(rawBody: string, headers: Headers): GatewayUpdate | null;
  /** Asks the gateway for a payment's latest status. */
  fetchStatus(payment: {
    gatewayPaymentId: string;
    amount: number;
    meta: string;
  }): Promise<GatewayUpdate>;
}
