import { isDemoMode } from "../config";
import { db } from "../db";
import { UserFacingError } from "../errors";
import { retryOrderPayment } from "../payments/service";
import {
  apiGetPayment,
  DEMO_PENDING_MS,
  emitWebhook,
  returnRedirect,
  settle,
  type DemoPaymentScenario,
} from "./gateway-server";

/*
 * What the demo gateway's "Pay" buttons do. Each scenario sets the
 * gateway-side outcome, fires the gateway's signed webhook(s), and returns
 * the signed redirect back to our site — the same three signals a real
 * gateway produces. Our PaymentService handles them exactly as it would a
 * real gateway's.
 */
export async function runDemoPaymentScenario(
  gatewayPaymentId: string,
  scenario: DemoPaymentScenario,
): Promise<string> {
  if (!isDemoMode()) throw new UserFacingError("Demo payments are disabled.");
  const payment = await apiGetPayment(gatewayPaymentId);
  if (!payment) throw new UserFacingError("Unknown payment.");
  if (payment.status !== "CREATED") return returnRedirect(payment); // link already used

  const later = new Date(Date.now() + DEMO_PENDING_MS);
  switch (scenario) {
    case "SUCCESS":
      await settle(gatewayPaymentId, "SUCCEEDED", { scenario });
      await emitWebhook(gatewayPaymentId);
      break;
    case "FAILED":
      await settle(gatewayPaymentId, "FAILED", {
        scenario,
        failureReason: "Payment declined by the bank (simulated).",
      });
      await emitWebhook(gatewayPaymentId);
      break;
    case "CANCELLED":
      await settle(gatewayPaymentId, "CANCELLED", {
        scenario,
        failureReason: "Cancelled on the payment page.",
      });
      await emitWebhook(gatewayPaymentId);
      break;
    case "PENDING_SUCCESS":
    case "PENDING_FAILURE":
      await settle(gatewayPaymentId, "PENDING", {
        scenario,
        settleAt: later,
        settleTo: scenario === "PENDING_SUCCESS" ? "SUCCEEDED" : "FAILED",
      });
      await emitWebhook(gatewayPaymentId);
      break;
    case "DUPLICATE_WEBHOOK":
      await settle(gatewayPaymentId, "SUCCEEDED", { scenario });
      await emitWebhook(gatewayPaymentId, 2); // same event id, delivered twice
      break;
    case "WRONG_AMOUNT":
      await settle(gatewayPaymentId, "SUCCEEDED", {
        scenario,
        capturedPaise: payment.amountPaise - 100,
      });
      await emitWebhook(gatewayPaymentId);
      break;
    case "DELAYED_SUCCESS":
      // Reported as failed now; the bank captures later and no webhook is
      // sent — only status polling / reconciliation will find it.
      await settle(gatewayPaymentId, "FAILED", {
        scenario,
        failureReason: "Bank timeout (simulated).",
        settleAt: later,
        settleTo: "SUCCEEDED",
      });
      await emitWebhook(gatewayPaymentId);
      break;
    case "DOUBLE_CAPTURE":
      return doubleCapture(gatewayPaymentId);
  }
  return returnRedirect((await apiGetPayment(gatewayPaymentId))!);
}

/**
 * Attempt 1 "fails" → the customer retries (our real retry path creates
 * attempt 2) → attempt 2 succeeds → attempt 1 is then captured late too.
 * Expected: ONE fulfilment, attempt 1 flagged as extra capture and refunded.
 */
async function doubleCapture(firstGatewayPaymentId: string): Promise<string> {
  await settle(firstGatewayPaymentId, "FAILED", {
    scenario: "DOUBLE_CAPTURE",
    failureReason: "Bank timeout (simulated).",
  });
  await emitWebhook(firstGatewayPaymentId);

  const first = await db.payment.findUniqueOrThrow({
    where: { gatewayPaymentId: firstGatewayPaymentId },
    include: { order: { include: { user: true } } },
  });
  const { user } = first.order;
  await retryOrderPayment(user.id, first.orderId, {
    name: user.name,
    email: user.email,
  });
  const second = await db.payment.findFirstOrThrow({
    where: { orderId: first.orderId },
    orderBy: { createdAt: "desc" },
  });
  await settle(second.gatewayPaymentId, "SUCCEEDED", {
    scenario: "DOUBLE_CAPTURE",
  });
  await emitWebhook(second.gatewayPaymentId);

  await settle(firstGatewayPaymentId, "SUCCEEDED", {
    scenario: "DOUBLE_CAPTURE",
  }); // late capture
  await emitWebhook(firstGatewayPaymentId);

  return returnRedirect((await apiGetPayment(second.gatewayPaymentId))!);
}
