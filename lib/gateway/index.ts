import { mockPaymentsAllowed, paymentGatewayId } from "../env";
import { mockGateway } from "./mock";
import type { PaymentGateway } from "./types";

/* Registered adapters. Add e.g. `razorpay: razorpayGateway` here. */
const GATEWAYS: Record<string, PaymentGateway> = {
  mock: mockGateway,
};

/** The adapter for a stored Payment row (it keeps the gateway it was made on). */
export function getGatewayById(id: string): PaymentGateway {
  const gateway = GATEWAYS[id];
  if (!gateway) throw new Error(`Unknown payment gateway "${id}".`);
  if (gateway.id === "mock" && !mockPaymentsAllowed()) {
    throw new Error(
      "The mock payment gateway is disabled in production. Set PAYMENT_GATEWAY to a real gateway (or ALLOW_MOCK_PAYMENTS=true on staging).",
    );
  }
  return gateway;
}

/** The adapter new payments go through (PAYMENT_GATEWAY, default "mock"). */
export function getGateway(): PaymentGateway {
  return getGatewayById(paymentGatewayId());
}

export type { GatewayStatus, GatewayUpdate, PaymentGateway } from "./types";
