import { randomBytes, randomInt } from "node:crypto";
import { decrypt, encrypt } from "../crypto";
import { db } from "../db";
import {
  DEMO_BRANDS,
  DEMO_HOW_TO_REDEEM,
  DEMO_SLUGS,
  DEMO_TERMS,
  demoProductRef,
} from "./catalogue-data";

/*
 * ─── SIMULATED EXTERNAL SYSTEM ──────────────────────────────────────────
 * Plays the role of a third-party gift-card supplier ("DemoCards"). It has
 * its OWN persistent state — catalogue, orders, issued cards, a prefunded
 * balance and debits — in the Demo* tables, and speaks a "wire" format
 * (snake_case JSON) that the DemoGiftCardProvider adapter must validate and
 * map, exactly like a real HTTP API. Business logic never imports this.
 *
 * It honours OUR client reference as an idempotency key (unless the demo
 * lab switches that off), which is what lets us prove that "timeout after
 * issue → status lookup → recover" never issues a second card.
 */

export type DemoProviderScenario =
  | "SUCCESS"
  | "FAILURE"
  | "TIMEOUT_BEFORE_ISSUE"
  | "TIMEOUT_AFTER_ISSUE"
  | "PENDING_SUCCESS"
  | "PENDING_FAILURE"
  | "MALFORMED"
  | "PARTIAL"
  | "PROVIDER_DOWN"
  | "INSUFFICIENT_BALANCE";

export const DEMO_PROVIDER_SCENARIOS: {
  id: DemoProviderScenario;
  label: string;
  note: string;
}[] = [
  { id: "SUCCESS", label: "Success", note: "Cards issued immediately." },
  {
    id: "FAILURE",
    label: "Definitive failure",
    note: "Provider rejects; nothing issued → refund.",
  },
  {
    id: "TIMEOUT_BEFORE_ISSUE",
    label: "Timeout before issue",
    note: "Request times out; provider never created the order → safe re-send.",
  },
  {
    id: "TIMEOUT_AFTER_ISSUE",
    label: "Timeout after issue",
    note: "Provider issues the card, but our call times out → must recover via lookup, ONE card.",
  },
  {
    id: "PENDING_SUCCESS",
    label: "Pending → success",
    note: "Accepted; cards ~20s later.",
  },
  {
    id: "PENDING_FAILURE",
    label: "Pending → failure",
    note: "Accepted; fails ~20s later → refund.",
  },
  {
    id: "MALFORMED",
    label: "Malformed response",
    note: "Issues the card but returns garbage → lookup recovers.",
  },
  {
    id: "PARTIAL",
    label: "Partial fulfilment",
    note: "Issues one card fewer than asked (needs quantity > 1) → manual review.",
  },
  {
    id: "PROVIDER_DOWN",
    label: "Provider down (60s)",
    note: "All calls fail as unavailable for a minute.",
  },
  {
    id: "INSUFFICIENT_BALANCE",
    label: "Insufficient balance",
    note: "Rejects with INSUFFICIENT_BALANCE → manual review, no blind retry.",
  },
];

export const DEMO_PROVIDER_PENDING_MS = 20_000;
export const DEMO_PROVIDER_DOWN_MS = 60_000;
export const DEMO_STARTING_BALANCE_PAISE = 1_000_000 * 100; // ₹10,00,000
const ACCOUNT_ID = "DEMO";
const CONTROL_ID = "default";

/** Simulated transport failure (what an HTTP client would throw). */
export class DemoNetworkError extends Error {
  constructor(readonly kind: "TIMEOUT" | "UNAVAILABLE") {
    super(kind === "TIMEOUT" ? "Request timed out" : "Service unavailable");
    this.name = "DemoNetworkError";
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────

/** Idempotent: creates the demo supplier's catalogue/account/controls if missing. */
export async function seedDemoProvider(): Promise<void> {
  for (const b of DEMO_BRANDS) {
    const slug = DEMO_SLUGS[b.ref]!;
    await db.demoCatalogueBrand.upsert({
      where: { brandRef: b.ref },
      update: {},
      create: {
        brandRef: b.ref,
        name: b.name,
        category: b.category,
        description: b.description,
        color: b.color,
        logoPath: `/logos/${slug}.png`,
        terms: DEMO_TERMS,
        howToRedeem: DEMO_HOW_TO_REDEEM,
        validityMonths: b.validityMonths,
        featured: b.featured ?? false,
        defaultDiscountBps: b.discountBps,
      },
    });
    for (const rupees of b.denominations) {
      const face = rupees * 100;
      await db.demoCatalogueProduct.upsert({
        where: { productRef: demoProductRef(b.ref, rupees) },
        update: {},
        create: {
          productRef: demoProductRef(b.ref, rupees),
          brandRef: b.ref,
          faceValuePaise: face,
          costPaise: face - Math.floor((face * b.costBps + 5000) / 10000),
        },
      });
    }
  }
  await db.demoProviderAccount.upsert({
    where: { id: ACCOUNT_ID },
    update: {},
    create: { id: ACCOUNT_ID, balancePaise: DEMO_STARTING_BALANCE_PAISE },
  });
  await db.demoControl.upsert({
    where: { id: CONTROL_ID },
    update: {},
    create: { id: CONTROL_ID },
  });
}

export async function getDemoControl() {
  return db.demoControl.upsert({
    where: { id: CONTROL_ID },
    update: {},
    create: { id: CONTROL_ID },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function block(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

interface StoredCard {
  card_id: string;
  card_number: string;
  card_pin?: string;
  face_value_paise: number;
  expiry: string;
}

async function assertUp() {
  const control = await getDemoControl();
  if (control.providerDownUntil && control.providerDownUntil > new Date()) {
    throw new DemoNetworkError("UNAVAILABLE");
  }
  return control;
}

/** Takes the next scenario, reverting to SUCCESS unless sticky. */
async function consumeScenario(): Promise<DemoProviderScenario> {
  const control = await getDemoControl();
  const scenario = control.providerScenario as DemoProviderScenario;
  if (!control.providerSticky && scenario !== "SUCCESS") {
    const { count } = await db.demoControl.updateMany({
      where: { id: CONTROL_ID, providerScenario: scenario },
      data: { providerScenario: "SUCCESS" },
    });
    if (count === 0) return "SUCCESS"; // a concurrent request took it
  }
  return scenario;
}

function makeCards(
  brandRef: string,
  facePaise: number,
  count: number,
  validityMonths: number,
): StoredCard[] {
  const hasPin = DEMO_BRANDS.find((b) => b.ref === brandRef)?.hasPin ?? false;
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + validityMonths);
  return Array.from({ length: count }, () => ({
    card_id: `DV-${randomBytes(6).toString("hex").toUpperCase()}`,
    card_number: `TEST-${brandRef}-${block(4)}-${block(4)}`,
    ...(hasPin ? { card_pin: String(randomInt(100000, 1000000)) } : {}),
    face_value_paise: facePaise,
    expiry: expiry.toISOString(),
  }));
}

/**
 * Issues `count` cards against a provider order, debiting the prefunded
 * balance atomically. Returns false (and fails the order) if the balance
 * can't cover it.
 */
async function issueCards(orderId: string, count: number): Promise<boolean> {
  const order = await db.demoProviderOrder.findUniqueOrThrow({
    where: { id: orderId },
  });
  const product = await db.demoCatalogueProduct.findUniqueOrThrow({
    where: { productRef: order.productRef },
  });
  const brand = await db.demoCatalogueBrand.findUniqueOrThrow({
    where: { brandRef: product.brandRef },
  });
  const debit = order.unitCostPaise * count;
  const cards = makeCards(
    brand.brandRef,
    product.faceValuePaise,
    count,
    brand.validityMonths,
  );

  return db.$transaction(async (tx) => {
    const charged = await tx.demoProviderAccount.updateMany({
      where: { id: ACCOUNT_ID, balancePaise: { gte: debit } },
      data: { balancePaise: { decrement: debit } },
    });
    if (charged.count === 0) {
      await tx.demoProviderOrder.update({
        where: { id: orderId },
        data: {
          status: "FAILED",
          failureCode: "INSUFFICIENT_BALANCE",
          settleAt: null,
          settleTo: null,
        },
      });
      return false;
    }
    await tx.demoProviderDebit.create({
      data: { providerOrderRef: order.providerOrderRef, amountPaise: debit },
    });
    await tx.demoProviderOrder.update({
      where: { id: orderId },
      data: {
        status: "ISSUED",
        issuedCount: count,
        vouchersEncrypted: encrypt(JSON.stringify(cards)),
        settleAt: null,
        settleTo: null,
      },
    });
    return true;
  });
}

/** Applies a due pending settlement (lazily, when the order is next read). */
async function settleIfDue(orderId: string) {
  const order = await db.demoProviderOrder.findUniqueOrThrow({
    where: { id: orderId },
  });
  if (
    order.status !== "PENDING" ||
    !order.settleAt ||
    order.settleAt > new Date()
  )
    return;
  const claimed = await db.demoProviderOrder.updateMany({
    where: { id: orderId, status: "PENDING", settleAt: order.settleAt },
    data: { settleAt: null },
  });
  if (claimed.count === 0) return;
  if (order.settleTo === "ISSUED") await issueCards(orderId, order.quantity);
  else {
    await db.demoProviderOrder.update({
      where: { id: orderId },
      data: {
        status: "FAILED",
        failureCode: "ISSUER_DECLINED",
        settleTo: null,
      },
    });
  }
}

async function wireOrder(orderId: string): Promise<Record<string, unknown>> {
  await settleIfDue(orderId);
  const order = await db.demoProviderOrder.findUniqueOrThrow({
    where: { id: orderId },
  });
  const cards: StoredCard[] = order.vouchersEncrypted
    ? JSON.parse(decrypt(order.vouchersEncrypted))
    : [];
  return {
    order_id: order.providerOrderRef,
    client_ref: order.providerReference,
    product_ref: order.productRef,
    status: order.status,
    quantity: order.quantity,
    unit_cost_paise: order.unitCostPaise,
    failure_code: order.failureCode,
    failure_message: order.failureCode
      ? `Order failed: ${order.failureCode}`
      : null,
    cards,
  };
}

// ─── The "API" ───────────────────────────────────────────────────────────

export async function apiPlaceOrder(req: {
  client_ref: string;
  product_ref: string;
  quantity: number;
}): Promise<unknown> {
  const control = await assertUp();

  const existing = await db.demoProviderOrder.findFirst({
    where: { providerReference: req.client_ref },
    orderBy: { createdAt: "asc" },
  });
  if (existing && control.providerIdempotent) return wireOrder(existing.id);

  const scenario = await consumeScenario();
  if (scenario === "PROVIDER_DOWN") {
    await db.demoControl.update({
      where: { id: CONTROL_ID },
      data: { providerDownUntil: new Date(Date.now() + DEMO_PROVIDER_DOWN_MS) },
    });
    throw new DemoNetworkError("UNAVAILABLE");
  }
  if (scenario === "TIMEOUT_BEFORE_ISSUE")
    throw new DemoNetworkError("TIMEOUT");

  const product = await db.demoCatalogueProduct.findUnique({
    where: { productRef: req.product_ref },
  });
  const brand = product
    ? await db.demoCatalogueBrand.findUnique({
        where: { brandRef: product.brandRef },
      })
    : null;
  const order = await db.demoProviderOrder.create({
    data: {
      providerReference: req.client_ref,
      providerOrderRef: `DEMO-ORDER-${randomBytes(5).toString("hex").toUpperCase()}`,
      productRef: req.product_ref,
      quantity: req.quantity,
      unitCostPaise: product?.costPaise ?? 0,
      status: "PENDING",
    },
  });

  const reject = async (code: string) => {
    await db.demoProviderOrder.update({
      where: { id: order.id },
      data: { status: "FAILED", failureCode: code },
    });
    return wireOrder(order.id);
  };
  if (
    !product ||
    !brand ||
    product.status !== "ACTIVE" ||
    brand.status !== "ACTIVE"
  )
    return reject("PRODUCT_UNAVAILABLE");
  if (scenario === "FAILURE") return reject("ISSUER_DECLINED");
  if (scenario === "INSUFFICIENT_BALANCE")
    return reject("INSUFFICIENT_BALANCE");

  if (scenario === "PENDING_SUCCESS" || scenario === "PENDING_FAILURE") {
    await db.demoProviderOrder.update({
      where: { id: order.id },
      data: {
        settleAt: new Date(Date.now() + DEMO_PROVIDER_PENDING_MS),
        settleTo: scenario === "PENDING_SUCCESS" ? "ISSUED" : "FAILED",
      },
    });
    return wireOrder(order.id);
  }

  const count =
    scenario === "PARTIAL" && req.quantity > 1
      ? req.quantity - 1
      : req.quantity;
  await issueCards(order.id, count);

  if (scenario === "TIMEOUT_AFTER_ISSUE") throw new DemoNetworkError("TIMEOUT"); // issued, reply lost
  if (scenario === "MALFORMED")
    return { order: "????", cards: "<html>502 Bad Gateway</html>" };
  return wireOrder(order.id);
}

/** GET /orders?client_ref=… → wire order, or null (404). */
export async function apiGetOrder(clientRef: string): Promise<unknown | null> {
  await assertUp();
  const order = await db.demoProviderOrder.findFirst({
    where: { providerReference: clientRef },
    orderBy: { createdAt: "asc" },
  });
  return order ? wireOrder(order.id) : null;
}

export async function apiCatalogue() {
  await assertUp();
  const [brands, products] = await Promise.all([
    db.demoCatalogueBrand.findMany({ orderBy: { brandRef: "asc" } }),
    db.demoCatalogueProduct.findMany({ orderBy: { productRef: "asc" } }),
  ]);
  return { brands, products };
}

export async function apiBalance() {
  await assertUp();
  const account = await db.demoProviderAccount.findUnique({
    where: { id: ACCOUNT_ID },
  });
  return { balance_paise: account?.balancePaise ?? 0, currency: "INR" };
}

export async function apiListOrders(since: Date) {
  await assertUp();
  return db.demoProviderOrder.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
  });
}

// ─── Demo-lab mutations of the supplier's own catalogue/account ──────────

export async function setDemoBalance(balancePaise: number) {
  await db.demoProviderAccount.upsert({
    where: { id: ACCOUNT_ID },
    update: { balancePaise },
    create: { id: ACCOUNT_ID, balancePaise },
  });
}
