"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { db } from "@/lib/db";
import { demoProductRef } from "@/lib/demo/catalogue-data";
import {
  DEMO_PAYMENT_SCENARIOS,
  type DemoPaymentScenario,
} from "@/lib/demo/gateway-server";
import {
  DEMO_PROVIDER_DOWN_MS,
  DEMO_PROVIDER_SCENARIOS,
  getDemoControl,
  setDemoBalance,
  type DemoProviderScenario,
} from "@/lib/demo/provider-server";
import { publicMessage } from "@/lib/errors";

/*
 * Demo lab: switches for the SIMULATED external systems. Exists only in
 * APP_MODE=demo and only for admins. These actions change what the demo
 * gateway / demo provider will do next — they never touch our orders,
 * which must react to whatever the "external" systems do.
 */

async function labAction(
  name: string,
  fn: () => Promise<unknown>,
): Promise<never> {
  if (!isDemoMode()) notFound();
  const admin = await requireAdmin("/admin/demo-lab");
  let message: string;
  try {
    const result = await fn();
    await audit({
      action: "DEMO_CONTROL_CHANGED",
      entityType: "DemoControl",
      entityId: "default",
      actorType: "ADMIN",
      actorId: admin.id,
      data: { action: name },
    });
    message = typeof result === "string" ? result : `${name}: done`;
  } catch (error) {
    message = `${name} failed: ${publicMessage(error)}`;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/demo-lab?msg=${encodeURIComponent(message)}`);
}

export async function labSetProviderScenarioAction(formData: FormData) {
  const scenario = String(formData.get("scenario")) as DemoProviderScenario;
  const sticky = formData.get("sticky") === "on";
  return labAction("Set provider scenario", async () => {
    if (!DEMO_PROVIDER_SCENARIOS.some((s) => s.id === scenario))
      throw new Error("Unknown scenario");
    await getDemoControl();
    await db.demoControl.update({
      where: { id: "default" },
      data: { providerScenario: scenario, providerSticky: sticky },
    });
    return `Next provider order: ${scenario}${sticky ? " (sticky)" : ""}`;
  });
}

export async function labSetIdempotencyAction(on: boolean) {
  return labAction("Provider idempotency", async () => {
    await getDemoControl();
    await db.demoControl.update({
      where: { id: "default" },
      data: { providerIdempotent: on },
    });
    return on
      ? "Provider de-duplicates repeated references"
      : "Provider is NON-idempotent (creates duplicates on re-send)";
  });
}

export async function labProviderDownAction(down: boolean) {
  return labAction(
    down ? "Take provider down" : "Bring provider up",
    async () => {
      await getDemoControl();
      await db.demoControl.update({
        where: { id: "default" },
        data: {
          providerDownUntil: down
            ? new Date(Date.now() + DEMO_PROVIDER_DOWN_MS)
            : null,
        },
      });
    },
  );
}

export async function labSetBalanceAction(formData: FormData) {
  const rupees = Number(formData.get("rupees"));
  return labAction("Set provider balance", async () => {
    if (!Number.isFinite(rupees) || rupees < 0 || rupees > 1e8)
      throw new Error("Invalid amount");
    await setDemoBalance(Math.round(rupees * 100));
    return `Demo provider balance set to ₹${rupees.toLocaleString("en-IN")}`;
  });
}

export async function labArmPaymentScenarioAction(formData: FormData) {
  const raw = String(formData.get("scenario") ?? "");
  return labAction("Arm payment scenario", async () => {
    const scenario = raw === "" ? null : (raw as DemoPaymentScenario);
    if (scenario && !DEMO_PAYMENT_SCENARIOS.some((s) => s.id === scenario))
      throw new Error("Unknown scenario");
    await getDemoControl();
    await db.demoControl.update({
      where: { id: "default" },
      data: { paymentScenario: scenario },
    });
    return scenario
      ? `Demo gateway will highlight ${scenario}`
      : "Payment scenario cleared";
  });
}

export async function labRefundFailNextAction() {
  return labAction("Fail next refund", async () => {
    await getDemoControl();
    await db.demoControl.update({
      where: { id: "default" },
      data: { refundFailNext: true },
    });
    return "The next demo refund will be rejected";
  });
}

// ── Simulated supplier catalogue changes (then press "Sync catalogue") ──

export async function labCatalogueAction(formData: FormData) {
  const op = String(formData.get("op"));
  const brandRef = String(formData.get("brandRef") ?? "");
  const productRef = String(formData.get("productRef") ?? "");
  return labAction("Change demo supplier catalogue", async () => {
    switch (op) {
      case "add-denomination": {
        const rupees = Number(formData.get("rupees"));
        if (!Number.isInteger(rupees) || rupees < 10 || rupees > 10000)
          throw new Error("Denomination ₹10–₹10,000");
        const face = rupees * 100;
        await db.demoCatalogueProduct.upsert({
          where: { productRef: demoProductRef(brandRef, rupees) },
          update: { status: "ACTIVE" },
          create: {
            productRef: demoProductRef(brandRef, rupees),
            brandRef,
            faceValuePaise: face,
            costPaise: face - Math.round(face * 0.03),
          },
        });
        return `Supplier added ${brandRef} ₹${rupees}`;
      }
      case "product-status": {
        const status = String(formData.get("status"));
        if (!["ACTIVE", "DISABLED", "OUT_OF_STOCK"].includes(status))
          throw new Error("Bad status");
        await db.demoCatalogueProduct.update({
          where: { productRef },
          data: { status },
        });
        return `Supplier set ${productRef} to ${status}`;
      }
      case "product-cost": {
        const bps = Number(formData.get("costBps"));
        if (!Number.isInteger(bps) || bps < 0 || bps > 5000)
          throw new Error("Cost discount 0–5000 bps");
        const p = await db.demoCatalogueProduct.findUniqueOrThrow({
          where: { productRef },
        });
        await db.demoCatalogueProduct.update({
          where: { productRef },
          data: {
            costPaise:
              p.faceValuePaise - Math.round((p.faceValuePaise * bps) / 10000),
          },
        });
        return `Supplier cost for ${productRef} now face − ${bps / 100}%`;
      }
      case "brand-status": {
        const status = String(formData.get("status"));
        if (!["ACTIVE", "DISABLED", "OUT_OF_STOCK"].includes(status))
          throw new Error("Bad status");
        await db.demoCatalogueBrand.update({
          where: { brandRef },
          data: { status },
        });
        return `Supplier set brand ${brandRef} to ${status}`;
      }
      case "brand-terms": {
        const brand = await db.demoCatalogueBrand.findUniqueOrThrow({
          where: { brandRef },
        });
        await db.demoCatalogueBrand.update({
          where: { brandRef },
          data: {
            terms: [
              ...brand.terms,
              `Demo terms update ${new Date().toISOString().slice(0, 16)}.`,
            ],
          },
        });
        return `Supplier updated ${brandRef} terms`;
      }
      default:
        throw new Error("Unknown operation");
    }
  });
}
