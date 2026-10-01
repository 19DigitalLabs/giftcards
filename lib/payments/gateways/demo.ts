import { z } from "zod";
import { safeEqual } from "../../crypto";
import {
  apiCreatePayment,
  apiGetPayment,
  apiGetRefund,
  apiRefund,
  DEMO_WEBHOOK_SIGNATURE_HEADER,
  signReturn,
  signWebhook,
} from "../../demo/gateway-server";
import {
  GatewayError,
  type GatewayEvent,
  type GatewayPaymentState,
  type GatewayPaymentStatus,
  type PaymentGateway,
} from "../types";

/*
 * Adapter for the simulated "DemoPay" gateway. Shaped like a real adapter:
 * it only maps requests/responses and checks signatures. Replace with e.g.
 * RazorpayGateway implementing the same PaymentGateway interface.
 */

const WEBHOOK_TOLERANCE_S = 5 * 60;
const RETURN_TOLERANCE_S = 24 * 60 * 60;

const eventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  created: z.number().int(),
  data: z.object({
    payment_id: z.string().min(1),
    merchant_ref: z.string().min(1),
    order_ref: z.string(),
    status: z.enum(["CREATED", "PENDING", "SUCCEEDED", "FAILED", "CANCELLED"]),
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
    failure_reason: z.string().nullable().optional(),
  }),
});

function toState(p: {
  gatewayPaymentId: string;
  merchantRef: string;
  status: string;
  amountPaise: number;
  capturedPaise: number | null;
  currency: string;
  failureReason: string | null;
}): GatewayPaymentState {
  return {
    gatewayPaymentId: p.gatewayPaymentId,
    merchantRef: p.merchantRef,
    status: p.status as GatewayPaymentStatus,
    amountPaise:
      p.status === "SUCCEEDED"
        ? (p.capturedPaise ?? p.amountPaise)
        : p.amountPaise,
    currency: p.currency,
    failureReason: p.failureReason ?? undefined,
  };
}

export const demoPaymentGateway: PaymentGateway = {
  code: "demo",
  isDemo: true,

  async createPayment(input) {
    return apiCreatePayment({
      merchantRef: input.merchantRef,
      orderRef: input.orderRef,
      amountPaise: input.amountPaise,
      currency: input.currency,
      returnUrl: input.returnUrl,
    });
  },

  async getPaymentStatus(gatewayPaymentId) {
    const payment = await apiGetPayment(gatewayPaymentId);
    if (!payment)
      throw new GatewayError(`Unknown payment ${gatewayPaymentId}`, false);
    return toState(payment);
  },

  verifyReturn(params) {
    const gatewayPaymentId = params.get("payment_id");
    const ts = Number(params.get("ts"));
    const sig = params.get("sig");
    if (!gatewayPaymentId || !Number.isInteger(ts) || !sig) return null;
    if (Math.abs(Date.now() / 1000 - ts) > RETURN_TOLERANCE_S) return null;
    return safeEqual(sig, signReturn(gatewayPaymentId, ts))
      ? { gatewayPaymentId }
      : null;
  },

  parseWebhook(rawBody, headers): GatewayEvent | null {
    const header = headers.get(DEMO_WEBHOOK_SIGNATURE_HEADER) ?? "";
    const ts = Number(/t=(\d+)/.exec(header)?.[1]);
    if (
      !Number.isInteger(ts) ||
      Math.abs(Date.now() / 1000 - ts) > WEBHOOK_TOLERANCE_S
    )
      return null;
    if (!safeEqual(header, signWebhook(rawBody, ts))) return null;

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const parsed = eventSchema.safeParse(json);
    if (!parsed.success) return null;
    const e = parsed.data;
    return {
      externalEventId: e.id,
      eventType: e.type,
      payment: {
        gatewayPaymentId: e.data.payment_id,
        merchantRef: e.data.merchant_ref,
        status: e.data.status,
        amountPaise: e.data.amount,
        currency: e.data.currency,
        failureReason: e.data.failure_reason ?? undefined,
      },
      sanitizedPayload: e as unknown as Record<string, unknown>,
    };
  },

  async refund(input) {
    const result = await apiRefund({
      gatewayPaymentId: input.gatewayPaymentId,
      amountPaise: input.amountPaise,
      idempotencyKey: input.idempotencyKey,
    });
    return {
      status: result.status,
      gatewayRefundId: result.gatewayRefundId || undefined,
      failureReason: result.failureReason,
    };
  },

  async getRefundStatus(gatewayRefundId) {
    const refund = await apiGetRefund(gatewayRefundId);
    if (!refund)
      throw new GatewayError(`Unknown refund ${gatewayRefundId}`, false);
    return {
      status: refund.status as "SUCCEEDED" | "PENDING" | "FAILED",
      gatewayRefundId,
      failureReason: refund.failureReason ?? undefined,
    };
  },
};
