import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { startCheckout } from "@/lib/orders/checkout";
import {
  AMAZON_1000,
  addToCart,
  checkout,
  createUser,
  key,
  product,
  resetDb,
} from "./helpers";

describe("checkout", () => {
  beforeEach(resetDb);

  it("snapshots demo economics onto the order (₹1,000 face, ₹990 pay, ₹975 cost)", async () => {
    const user = await createUser();
    const { orderId, redirectUrl } = await checkout(user);
    expect(redirectUrl).toMatch(/\/pay\/demo\/dpay_/);
    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, payments: true },
    });
    expect(order).toMatchObject({
      status: "PAYMENT_PENDING",
      faceValuePaise: 100000,
      discountPaise: 1000,
      feePaise: 0,
      totalPaise: 99000,
      costPricePaise: 97500,
      isTest: true,
    });
    expect(order.items[0]).toMatchObject({
      faceValuePaise: 100000,
      sellingPricePaise: 99000,
      discountPaise: 1000,
      costPricePaise: 97500,
      quantity: 1,
    });
    expect(order.payments).toHaveLength(1);
    expect(order.payments[0]!.amountPaise).toBe(99000);
  });

  it("double click / browser retry with the same key returns the same order", async () => {
    const user = await createUser();
    await addToCart(user, AMAZON_1000);
    const k = key();
    const a = await startCheckout(user, k);
    const b = await startCheckout(user, k);
    expect(b.orderId).toBe(a.orderId);
    expect(b.resumed).toBe(true);
    expect(await db.order.count()).toBe(1);
    expect(await db.payment.count()).toBe(1);
  });

  it("parallel identical submits create ONE payable order", async () => {
    const user = await createUser();
    await addToCart(user, AMAZON_1000);
    const k = key();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => startCheckout(user, k)),
    );
    expect(new Set(results.map((r) => r.orderId)).size).toBe(1);
    expect(await db.order.count()).toBe(1);
    expect(await db.payment.count()).toBe(1);
  });

  it("rejects unverified email, invalid key, empty cart", async () => {
    const unverified = await createUser({ verified: false });
    await addToCart(unverified, AMAZON_1000);
    await expect(startCheckout(unverified, key())).rejects.toThrow(
      /verify your email/,
    );
    const user = await createUser();
    await expect(startCheckout(user, "short")).rejects.toThrow(/expired/);
    await expect(startCheckout(user, key())).rejects.toThrow(/empty/);
  });

  it("disabled product / disabled brand / out-of-stock blocks checkout", async () => {
    const user = await createUser();
    await addToCart(user, AMAZON_1000);
    const p = await product(AMAZON_1000);
    await db.product.update({
      where: { id: p.id },
      data: { status: "OUT_OF_STOCK" },
    });
    await expect(startCheckout(user, key())).rejects.toThrow(
      /temporarily unavailable/,
    );
    await db.product.update({
      where: { id: p.id },
      data: { status: "ACTIVE" },
    });
    await db.brand.update({
      where: { id: p.brandId },
      data: { status: "DISABLED" },
    });
    await expect(startCheckout(user, key())).rejects.toThrow(
      /temporarily unavailable/,
    );
    expect(await db.order.count()).toBe(0);
  });

  it("price changed after adding to cart: order uses the current server price", async () => {
    const user = await createUser();
    await addToCart(user, AMAZON_1000);
    const p = await product(AMAZON_1000);
    await db.product.update({
      where: { id: p.id },
      data: { sellingPricePaise: 98500 },
    });
    const { orderId } = await startCheckout(user, key());
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.totalPaise).toBe(98500);
  });

  it("enforces the per-order cap", async () => {
    const user = await createUser();
    await addToCart(user, "DEMO-AMAZONPAY-5000", 6); // ₹30,000 face
    await expect(startCheckout(user, key())).rejects.toThrow(/limited to/);
  });
});
