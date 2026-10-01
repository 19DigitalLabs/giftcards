import { beforeEach, describe, expect, it } from "vitest";
import { syncCatalogue } from "@/lib/catalogue/sync";
import { db } from "@/lib/db";
import { processOrder } from "@/lib/fulfilment/service";
import { runScheduledWork } from "@/lib/jobs";
import { startOrderRefund } from "@/lib/payments/refunds";
import {
  AMAZON_1000,
  checkout,
  createUser,
  ledger,
  orderStatus,
  pay,
  product,
  resetDb,
  setProviderScenario,
} from "./helpers";

describe("refunds", () => {
  beforeEach(resetDb);

  it("refund failure → MANUAL_REVIEW (never REFUNDED); admin re-initiates → REFUNDED", async () => {
    const user = await createUser();
    const { orderId } = await checkout(user);
    await pay(orderId, "SUCCESS");
    await setProviderScenario("FAILURE");
    await db.demoControl.update({
      where: { id: "default" },
      data: { refundFailNext: true },
    });
    expect(await processOrder(orderId)).toBe("MANUAL_REVIEW");
    const refunds = await db.refund.findMany({ where: { orderId } });
    expect(refunds.map((r) => r.status)).toEqual(["FAILED"]);
    expect(
      await db.reconciliationIssue.count({ where: { type: "REFUND_FAILED" } }),
    ).toBe(1);
    expect(
      (await ledger(orderId)).some((e) => e.type === "PAYMENT_REFUNDED"),
    ).toBe(false);

    await startOrderRefund(orderId, "Admin retry", { type: "ADMIN" });
    expect(await orderStatus(orderId)).toBe("REFUNDED");
    expect(
      (await ledger(orderId)).filter((e) => e.type === "PAYMENT_REFUNDED"),
    ).toHaveLength(1);
  });

  it("refuses to refund an order whose vouchers were issued", async () => {
    const user = await createUser();
    const { orderId } = await checkout(user, AMAZON_1000, 2);
    await pay(orderId, "SUCCESS");
    await setProviderScenario("PARTIAL");
    expect(await processOrder(orderId)).toBe("MANUAL_REVIEW");
    await expect(
      startOrderRefund(orderId, "x", { type: "ADMIN" }),
    ).rejects.toThrow(/issued/);
  });

  it("ledger is append-only at the database level", async () => {
    const user = await createUser();
    const { orderId } = await checkout(user);
    await pay(orderId, "SUCCESS");
    const entry = (await ledger(orderId))[0]!;
    await expect(
      db.ledgerEntry.update({
        where: { id: entry.id },
        data: { amountPaise: 1 },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.ledgerEntry.delete({ where: { id: entry.id } }),
    ).rejects.toThrow(/append-only/);
  });
});

describe("catalogue sync", () => {
  beforeEach(resetDb);

  it("new denomination, cost change, disable, brand unavailable, terms — orders keep snapshots", async () => {
    const user = await createUser();
    const { orderId } = await checkout(user);
    await pay(orderId, "SUCCESS");
    await processOrder(orderId);

    await db.demoCatalogueProduct.create({
      data: {
        productRef: "AMAZONPAY-750",
        brandRef: "AMAZONPAY",
        faceValuePaise: 75000,
        costPaise: 73000,
      },
    });
    await db.demoCatalogueProduct.update({
      where: { productRef: "AMAZONPAY-1000" },
      data: { costPaise: 96000 },
    });
    await db.demoCatalogueProduct.update({
      where: { productRef: "AMAZONPAY-5000" },
      data: { status: "DISABLED" },
    });
    await db.demoCatalogueBrand.update({
      where: { brandRef: "SWIGGY" },
      data: { status: "OUT_OF_STOCK", terms: ["Changed terms"] },
    });

    const summary = await syncCatalogue("DEMO");
    expect(summary.productsCreated).toBe(1);

    expect((await product("DEMO-AMAZONPAY-750")).status).toBe("ACTIVE");
    const p1000 = await product(AMAZON_1000);
    expect(p1000.costPricePaise).toBe(96000);
    expect(p1000.sellingPricePaise).toBe(99000); // 1% discount still applies (above cost)
    expect((await product("DEMO-AMAZONPAY-5000")).status).toBe("DISABLED");
    const swiggy = await db.brand.findUniqueOrThrow({
      where: { slug: "swiggy" },
    });
    expect(swiggy.status).toBe("OUT_OF_STOCK");
    expect(swiggy.terms).toEqual(["Changed terms"]);

    const item = await db.orderItem.findFirstOrThrow({ where: { orderId } });
    expect(item.costPricePaise).toBe(97500); // historical snapshot unchanged
    expect(await orderStatus(orderId)).toBe("FULFILLED");
  });

  it("admin disable survives a sync; provider re-enable doesn't override it", async () => {
    const p = await product(AMAZON_1000);
    await db.product.update({
      where: { id: p.id },
      data: { adminDisabled: true, status: "DISABLED" },
    });
    await syncCatalogue("DEMO");
    expect((await product(AMAZON_1000)).status).toBe("DISABLED");
  });

  it("delisted products are disabled, not deleted", async () => {
    await db.demoCatalogueProduct.delete({
      where: { productRef: "AMAZONPAY-100" },
    });
    const summary = await syncCatalogue("DEMO");
    expect(summary.productsDelisted).toBe(1);
    expect((await product("DEMO-AMAZONPAY-100")).status).toBe("DISABLED");
  });

  it("scheduled work runs end to end", async () => {
    const user = await createUser();
    const { orderId } = await checkout(user);
    await pay(orderId, "SUCCESS");
    const summary = await runScheduledWork();
    expect(summary.fulfilment).toBe(1);
    expect(await orderStatus(orderId)).toBe("FULFILLED");
  });
});
