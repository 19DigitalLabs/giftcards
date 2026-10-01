import { getGateway } from "@/lib/gateway";
import { applyGatewayUpdate } from "@/lib/orders";

/*
 * Server-to-server payment notifications — the source of truth when the
 * buyer closes the tab before the return redirect, or a payment settles
 * late. Signed by the gateway; anything unsigned is rejected.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const update = getGateway().verifyWebhook(rawBody, request.headers);
  if (!update) {
    return Response.json(
      { error: "Invalid signature or payload." },
      { status: 401 },
    );
  }
  const orderId = await applyGatewayUpdate(update);
  if (!orderId)
    return Response.json({ error: "Unknown payment." }, { status: 404 });
  return Response.json({ ok: true });
}
