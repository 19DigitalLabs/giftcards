"use server";

import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/config";
import type { DemoPaymentScenario } from "@/lib/demo/gateway-server";
import { runDemoPaymentScenario } from "@/lib/demo/scenarios";
import { publicMessage } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

/** "Pay" buttons on the demo gateway's hosted page (/pay/demo/[id]). */
export async function demoGatewayAction(
  gatewayPaymentId: string,
  scenario: DemoPaymentScenario,
): Promise<void> {
  if (!isDemoMode()) redirect("/");
  const limit = await rateLimit(
    `demo-pay:${await clientIp()}`,
    60,
    10 * 60 * 1000,
  );
  if (!limit.ok) redirect(`/pay/demo/${gatewayPaymentId}?error=rate`);
  let target: string;
  try {
    target = await runDemoPaymentScenario(gatewayPaymentId, scenario);
  } catch (error) {
    redirect(
      `/pay/demo/${gatewayPaymentId}?error=${encodeURIComponent(publicMessage(error))}`,
    );
  }
  redirect(target);
}
