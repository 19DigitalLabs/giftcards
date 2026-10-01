import { z } from "zod";
import {
  apiBalance,
  apiCatalogue,
  apiGetOrder,
  apiListOrders,
  apiPlaceOrder,
  DemoNetworkError,
  getDemoControl,
} from "../../demo/provider-server";
import {
  ProviderError,
  type GiftCardProvider,
  type ProviderLookupResult,
  type ProviderOrderResult,
} from "../types";

/*
 * DemoGiftCardProvider — adapter for the simulated "DemoCards" supplier.
 * Same shape a PineLabsGiftCardProvider would have: call the API, validate
 * the response, map statuses and errors. NOTHING else.
 */

const cardSchema = z.object({
  card_id: z.string().min(1),
  card_number: z.string().min(1),
  card_pin: z.string().optional(),
  face_value_paise: z.number().int().positive(),
  expiry: z.string().datetime(),
});

const orderSchema = z.object({
  order_id: z.string().min(1),
  client_ref: z.string().min(1),
  status: z.enum(["PENDING", "ISSUED", "FAILED"]),
  quantity: z.number().int().positive(),
  unit_cost_paise: z.number().int().nonnegative(),
  failure_code: z.string().nullable().optional(),
  failure_message: z.string().nullable().optional(),
  cards: z.array(cardSchema),
});

/** Runs a "network" call, mapping transport failures to ProviderError. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DemoNetworkError)
      throw new ProviderError(error.kind, error.message);
    throw new ProviderError(
      "UNKNOWN",
      error instanceof Error ? error.message : "Provider call failed",
    );
  }
}

function mapOrder(raw: unknown): ProviderOrderResult {
  const parsed = orderSchema.safeParse(raw);
  if (!parsed.success) {
    // We don't know what happened — the caller must look the order up.
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      "Provider response failed validation",
    );
  }
  const o = parsed.data;
  if (o.status === "PENDING")
    return { outcome: "PENDING", providerOrderRef: o.order_id };
  if (o.status === "FAILED") {
    return {
      outcome: "FAILED",
      providerOrderRef: o.order_id,
      errorCode: o.failure_code ?? "UNKNOWN_FAILURE",
      errorMessage: o.failure_message ?? "Provider rejected the order",
    };
  }
  return {
    outcome: "ISSUED",
    providerOrderRef: o.order_id,
    unitCostPaise: o.unit_cost_paise,
    vouchers: o.cards.map((c) => ({
      providerVoucherRef: c.card_id,
      code: c.card_number,
      pin: c.card_pin,
      faceValuePaise: c.face_value_paise,
      expiresAt: new Date(c.expiry),
    })),
  };
}

const statusMap = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
  OUT_OF_STOCK: "OUT_OF_STOCK",
} as const;
function mapStatus(s: string) {
  return statusMap[s as keyof typeof statusMap] ?? "DISABLED";
}

export const demoGiftCardProvider: GiftCardProvider = {
  code: "DEMO",
  name: "Demo Gift Card Provider (simulated)",
  isDemo: true,

  async getCapabilities() {
    const control = await getDemoControl();
    return {
      idempotentPlaceOrder: control.providerIdempotent,
      statusLookup: true,
      balance: true,
      orderListing: true,
    };
  },

  async getCatalogue() {
    const raw = await call(() => apiCatalogue());
    return {
      brands: raw.brands.map((b) => ({
        brandRef: b.brandRef,
        name: b.name,
        category: b.category,
        description: b.description,
        color: b.color,
        logoPath: b.logoPath ?? undefined,
        status: mapStatus(b.status),
        terms: b.terms,
        howToRedeem: b.howToRedeem,
        validityMonths: b.validityMonths,
        featured: b.featured,
        suggestedDiscountBps: b.defaultDiscountBps,
      })),
      products: raw.products.map((p) => ({
        productRef: p.productRef,
        brandRef: p.brandRef,
        faceValuePaise: p.faceValuePaise,
        costPaise: p.costPaise,
        currency: "INR",
        status: mapStatus(p.status),
      })),
    };
  },

  async placeOrder(request) {
    const raw = await call(() =>
      apiPlaceOrder({
        client_ref: request.providerReference,
        product_ref: request.productRef,
        quantity: request.quantity,
      }),
    );
    return mapOrder(raw);
  },

  async getOrderStatus(providerReference): Promise<ProviderLookupResult> {
    const raw = await call(() => apiGetOrder(providerReference));
    if (raw === null) return { outcome: "NOT_FOUND" };
    return mapOrder(raw);
  },

  async getBalance() {
    const raw = await call(() => apiBalance());
    return { availablePaise: raw.balance_paise, currency: raw.currency };
  },

  async listOrdersSince(since) {
    const rows = await call(() => apiListOrders(since));
    return rows.map((r) => ({
      providerReference: r.providerReference,
      providerOrderRef: r.providerOrderRef,
      status: r.status as "PENDING" | "ISSUED" | "FAILED",
      quantity: r.quantity,
      issuedCount: r.issuedCount,
      createdAt: r.createdAt,
    }));
  },
};
