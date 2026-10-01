import { NextResponse, type NextRequest } from "next/server";
import { getGateway } from "@/lib/gateway";
import { applyGatewayUpdate } from "@/lib/orders";

/*
 * Where the gateway sends the buyer back after paying. The result in the URL
 * is only trusted after its signature checks out; then the buyer lands on
 * the payment status page. (Some gateways GET here, others POST a form.)
 */

async function handle(request: NextRequest, params: URLSearchParams) {
  const update = getGateway().verifyReturn(params);
  if (!update) {
    return NextResponse.redirect(
      new URL("/orders?payment=unverified", request.url),
      303,
    );
  }
  const orderId = await applyGatewayUpdate(update);
  const target = orderId
    ? `/payment/status/${orderId}`
    : "/orders?payment=unknown";
  return NextResponse.redirect(new URL(target, request.url), 303);
}

export async function GET(request: NextRequest) {
  return handle(request, request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const params = new URLSearchParams();
  for (const [key, value] of form)
    if (typeof value === "string") params.set(key, value);
  return handle(request, params);
}
