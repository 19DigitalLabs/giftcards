import { appMode, ConfigError, paymentGatewayCode } from "../../config";
import type { PaymentGateway } from "../types";
import { demoPaymentGateway } from "./demo";

/* Registered adapters. A real gateway is one new file + one entry here. */
const GATEWAYS: Record<string, PaymentGateway> = {
  demo: demoPaymentGateway,
};

/** The adapter a stored Payment was made with (payments keep their gateway). */
export function getGateway(code: string): PaymentGateway {
  const gateway = GATEWAYS[code];
  if (!gateway) throw new ConfigError(`Unknown payment gateway "${code}".`);
  if (gateway.isDemo && appMode() === "live") {
    throw new ConfigError("The demo payment gateway is disabled in live mode.");
  }
  return gateway;
}

/** The adapter new payments go through (PAYMENT_GATEWAY). */
export function activeGateway(): PaymentGateway {
  return getGateway(paymentGatewayCode());
}
