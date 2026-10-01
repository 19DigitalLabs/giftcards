import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hmacSha256, safeEqual } from "../crypto";
import { paymentWebhookSecret } from "../env";
import {
  GATEWAY_STATUSES,
  type GatewayStatus,
  type GatewayUpdate,
  type PaymentGateway,
} from "./types";

/*
 * Stand-in for a real hosted-checkout gateway, until Razorpay/PayU is wired
 * up. Its "hosted page" is /pay/mock/[id] in this app, where the tester picks
 * an outcome. That pick is kept in Payment.meta (playing the gateway's own
 * database), so status polls can resolve "pending" payments later. Return
 * redirects and webhooks are HMAC-signed exactly like a real gateway's, so
 * nobody can forge a success by editing the URL.
 */

export type MockOutcome =
  "success" | "failure" | "cancel" | "pending-success" | "pending-failure";

export interface MockMeta {
  returnUrl: string;
  outcome?: MockOutcome;
  /** Epoch ms when a pending outcome settles. */
  resolveAt?: number;
}

/** How long a simulated pending payment stays pending. */
export const MOCK_PENDING_MS = 20_000;

const REASONS = {
  failure: "Payment declined by the bank (simulated).",
  cancel: "You cancelled on the payment page.",
  pendingFailure: "Bank did not confirm the payment in time (simulated).",
};

function signFields(u: GatewayUpdate): string {
  return hmacSha256(
    paymentWebhookSecret(),
    [u.gatewayPaymentId, u.status, u.amount, u.failureReason ?? ""].join("|"),
  );
}

function isStatus(value: unknown): value is GatewayStatus {
  return GATEWAY_STATUSES.includes(value as GatewayStatus);
}

/** What the mock gateway reports right now for a payment's picked outcome. */
export function mockStatus(
  gatewayPaymentId: string,
  amount: number,
  meta: MockMeta,
  now = Date.now(),
): GatewayUpdate {
  const base = { gatewayPaymentId, amount };
  switch (meta.outcome) {
    case "success":
      return { ...base, status: "SUCCESS" };
    case "failure":
      return { ...base, status: "FAILED", failureReason: REASONS.failure };
    case "cancel":
      return { ...base, status: "CANCELLED", failureReason: REASONS.cancel };
    case "pending-success":
    case "pending-failure": {
      if (now < (meta.resolveAt ?? 0)) return { ...base, status: "PENDING" };
      return meta.outcome === "pending-success"
        ? { ...base, status: "SUCCESS" }
        : { ...base, status: "FAILED", failureReason: REASONS.pendingFailure };
    }
    default:
      // Buyer hasn't acted on the gateway page yet.
      return { ...base, status: "PENDING" };
  }
}

/** The signed URL the mock gateway redirects the buyer back to. */
export function mockReturnUrl(
  returnUrl: string,
  update: GatewayUpdate,
): string {
  const url = new URL(returnUrl);
  url.searchParams.set("payment_id", update.gatewayPaymentId);
  url.searchParams.set("status", update.status);
  url.searchParams.set("amount", String(update.amount));
  if (update.failureReason)
    url.searchParams.set("reason", update.failureReason);
  url.searchParams.set("signature", signFields(update));
  return url.toString();
}

/** Signature header value for a webhook body (for tests / local tooling). */
export function mockWebhookSignature(rawBody: string): string {
  return hmacSha256(paymentWebhookSecret(), rawBody);
}

const webhookSchema = z.object({
  payment_id: z.string().min(1),
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "CANCELLED"]),
  amount: z.number().int().nonnegative(),
  reason: z.string().optional(),
});

export const mockGateway: PaymentGateway = {
  id: "mock",

  async createPayment({ returnUrl }) {
    const gatewayPaymentId = `mockpay_${randomBytes(8).toString("hex")}`;
    const meta: MockMeta = { returnUrl };
    return {
      gatewayPaymentId,
      redirectUrl: `/pay/mock/${gatewayPaymentId}`,
      meta: { ...meta },
    };
  },

  verifyReturn(params) {
    const gatewayPaymentId = params.get("payment_id");
    const status = params.get("status");
    const amount = Number(params.get("amount"));
    const signature = params.get("signature");
    if (
      !gatewayPaymentId ||
      !isStatus(status) ||
      !Number.isInteger(amount) ||
      !signature
    ) {
      return null;
    }
    const update: GatewayUpdate = {
      gatewayPaymentId,
      status,
      amount,
      failureReason: params.get("reason") ?? undefined,
    };
    return safeEqual(signature, signFields(update)) ? update : null;
  },

  verifyWebhook(rawBody, headers) {
    const signature = headers.get("x-mock-signature");
    if (!signature || !safeEqual(signature, mockWebhookSignature(rawBody)))
      return null;
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const parsed = webhookSchema.safeParse(json);
    if (!parsed.success) return null;
    return {
      gatewayPaymentId: parsed.data.payment_id,
      status: parsed.data.status,
      amount: parsed.data.amount,
      failureReason: parsed.data.reason,
    };
  },

  async fetchStatus({ gatewayPaymentId, amount, meta }) {
    return mockStatus(gatewayPaymentId, amount, JSON.parse(meta) as MockMeta);
  },
};
