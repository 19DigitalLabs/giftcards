import { after } from "next/server";
import { processOrderSafely } from "@/lib/fulfilment/service";
import { log } from "@/lib/log";
import { receiveWebhook } from "@/lib/payments/webhooks";

/*
 * Server-to-server payment notifications. Signature-verified by the
 * gateway's adapter; each event id is processed once. A verified capture
 * kicks fulfilment immediately (cron is the safety net).
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ gateway: string }> },
) {
  const { gateway } = await ctx.params;
  const rawBody = await request.text();
  try {
    const result = await receiveWebhook(gateway, rawBody, request.headers);
    if (result.outcome === "FUNDED" && result.orderId) {
      const orderId = result.orderId;
      after(() => processOrderSafely(orderId));
    }
    return Response.json(
      { ok: result.status === 200 },
      { status: result.status },
    );
  } catch (error) {
    // 500 → the gateway retries; processing is idempotent.
    log.error("payment.webhook_failed", { error });
    return Response.json({ ok: false }, { status: 500 });
  }
}
