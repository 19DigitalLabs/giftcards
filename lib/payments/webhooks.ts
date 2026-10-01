import { log } from "../log";
import { getGateway } from "./gateways";
import { handleGatewayEvent, type PaymentOutcome } from "./service";

export interface WebhookResult {
  status: number;
  orderId?: string;
  outcome?: PaymentOutcome;
}

/**
 * One path for every gateway webhook: verify the signature with the
 * gateway's adapter, then hand the event to PaymentService. Used by
 * POST /api/payments/webhook/[gateway] and by the demo gateway's in-process
 * delivery, so both go through identical checks.
 */
export async function receiveWebhook(
  gatewayCode: string,
  rawBody: string,
  headers: Headers,
): Promise<WebhookResult> {
  let gateway;
  try {
    gateway = getGateway(gatewayCode);
  } catch {
    return { status: 404 };
  }
  const event = gateway.parseWebhook(rawBody, headers);
  if (!event) {
    log.warn("payment.webhook_rejected", {
      event: "bad_signature_or_payload",
      gateway: gatewayCode,
    });
    return { status: 401 };
  }
  const result = await handleGatewayEvent(gateway.code, event);
  return { status: 200, orderId: result.orderId, outcome: result.outcome };
}
