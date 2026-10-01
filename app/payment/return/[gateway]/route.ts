import { after, NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { processOrderSafely } from "@/lib/fulfilment/service";
import { log } from "@/lib/log";
import { getGateway } from "@/lib/payments/gateways";
import { refreshPayment } from "@/lib/payments/service";

/*
 * Where the gateway sends the buyer back. The redirect's signature only
 * proves WHICH payment it is; the outcome is then confirmed server-to-server
 * with the gateway (refreshPayment) — the browser is never trusted to say
 * "paid". Some gateways GET here, others POST a form.
 */

async function handle(
  request: NextRequest,
  gatewayCode: string,
  params: URLSearchParams,
) {
  const fallback = NextResponse.redirect(
    new URL("/orders?payment=unverified", request.url),
    303,
  );
  let gateway;
  try {
    gateway = getGateway(gatewayCode);
  } catch {
    return fallback;
  }
  const verified = gateway.verifyReturn(params);
  if (!verified) return fallback;

  const payment = await db.payment.findUnique({
    where: { gatewayPaymentId: verified.gatewayPaymentId },
  });
  if (!payment) return fallback;
  try {
    await refreshPayment(payment.id, "GATEWAY");
  } catch (error) {
    log.error("payment.return_refresh_failed", {
      paymentId: payment.id,
      error,
    });
  }
  const order = await db.order.findUniqueOrThrow({
    where: { id: payment.orderId },
  });
  if (order.status === "PAID") after(() => processOrderSafely(order.id));
  return NextResponse.redirect(
    new URL(`/payment/status/${order.id}`, request.url),
    303,
  );
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ gateway: string }> },
) {
  return handle(
    request,
    (await ctx.params).gateway,
    request.nextUrl.searchParams,
  );
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ gateway: string }> },
) {
  const form = await request.formData();
  const params = new URLSearchParams();
  for (const [key, value] of form)
    if (typeof value === "string") params.set(key, value);
  return handle(request, (await ctx.params).gateway, params);
}
