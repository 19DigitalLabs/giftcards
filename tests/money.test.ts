import { describe, expect, it } from "vitest";
import {
  applyBps,
  calculateDiscount,
  calculateMargin,
  formatBps,
  formatINR,
  rupees,
} from "@/lib/money";
import { computePrice } from "@/lib/pricing";

describe("money", () => {
  it("formats INR from paise", () => {
    expect(formatINR(100000)).toBe("₹1,000");
    expect(formatINR(99050)).toBe("₹990.50");
    expect(formatINR(12345678)).toBe("₹1,23,456.78");
    expect(formatINR(-1000)).toBe("-₹10");
    expect(formatINR(0)).toBe("₹0");
  });

  it("applies basis points with integer half-up rounding", () => {
    expect(applyBps(100000, 250)).toBe(2500);
    expect(applyBps(333, 150)).toBe(5); // 4.995 → 5
    expect(applyBps(333, 149)).toBe(5); // 4.9617 → 5
    expect(applyBps(100, 49)).toBe(0); // 0.49 → 0
    expect(() => applyBps(100.5, 10)).toThrow();
  });

  it("rejects non-integer money", () => {
    expect(() => formatINR(1.5)).toThrow();
    expect(rupees(990)).toBe(99000);
  });

  it("computes discount and margin", () => {
    expect(calculateDiscount(100000, 99000)).toBe(1000);
    expect(calculateMargin(99000, 97500)).toBe(1500);
    expect(formatBps(250)).toBe("2.5%");
    expect(formatBps(100)).toBe("1%");
  });

  it("prices the spec example: face ₹1,000, cost ₹975, 1% discount → ₹990, margin ₹15", () => {
    const p = computePrice({
      faceValuePaise: 100000,
      costPricePaise: 97500,
      discountBps: 100,
    });
    expect(p).toEqual({
      faceValuePaise: 100000,
      sellingPricePaise: 99000,
      discountPaise: 1000,
      costPricePaise: 97500,
      marginPaise: 1500,
    });
  });

  it("never sells below cost or above face value", () => {
    expect(
      computePrice({
        faceValuePaise: 100000,
        costPricePaise: 97500,
        discountBps: 500,
      }).sellingPricePaise,
    ).toBe(97500);
    expect(
      computePrice({
        faceValuePaise: 100000,
        costPricePaise: 97500,
        discountBps: -50,
      }).sellingPricePaise,
    ).toBe(100000);
  });
});
