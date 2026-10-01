import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  canTransition,
  claimOrderForFulfilment,
  ORDER_TRANSITIONS,
  transitionOrder,
} from "@/lib/orders/state";
import { checkout, createUser, resetDb } from "./helpers";

describe("order state machine", () => {
  beforeEach(resetDb);

  it("only allows documented transitions", () => {
    expect(canTransition("PAYMENT_PENDING", "PAID")).toBe(true);
    expect(canTransition("PAYMENT_PENDING", "FULFILLED")).toBe(false);
    expect(canTransition("REFUNDED", "PAID")).toBe(false);
    expect(canTransition("FULFILLED", "REFUND_PENDING")).toBe(false);
    expect(ORDER_TRANSITIONS.REFUNDED).toEqual([]);
  });

  it("throws on an illegal transition and refuses a stale one", async () => {
    const user = await createUser();
    const { orderId } = await checkout(user);
    await expect(
      transitionOrder(db, {
        orderId,
        from: "PAYMENT_PENDING",
        to: "FULFILLED",
      }),
    ).rejects.toThrow(/Illegal/);
    // Wrong current state → no write.
    expect(
      await transitionOrder(db, { orderId, from: "PAID", to: "FULFILLING" }),
    ).toBe(false);
    expect(
      await transitionOrder(db, {
        orderId,
        from: "PAYMENT_PENDING",
        to: "PAID",
      }),
    ).toBe(true);
    // Second identical move loses.
    expect(
      await transitionOrder(db, {
        orderId,
        from: "PAYMENT_PENDING",
        to: "PAID",
      }),
    ).toBe(false);
    const audit = await db.auditLog.findMany({
      where: { orderId, action: "ORDER_STATE_CHANGED" },
    });
    expect(audit).toHaveLength(1);
  });

  it("lets only one processor claim an order", async () => {
    const user = await createUser();
    const { orderId } = await checkout(user);
    await transitionOrder(db, { orderId, from: "PAYMENT_PENDING", to: "PAID" });
    const claims = await Promise.all([
      claimOrderForFulfilment(db, orderId, 60_000),
      claimOrderForFulfilment(db, orderId, 60_000),
      claimOrderForFulfilment(db, orderId, 60_000),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("no code outside lib/orders/state.ts writes Order.status", () => {
    const offenders: string[] = [];
    const root = path.resolve(".");
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", ".next", ".local", "tests", ".git"].includes(name))
          continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (
          /\.(ts|tsx)$/.test(name) &&
          !full.endsWith(path.join("lib", "orders", "state.ts"))
        ) {
          const src = readFileSync(full, "utf8");
          const re = /\.order\.(update|updateMany|upsert|create)\(/g;
          let m;
          while ((m = re.exec(src))) {
            const call = src.slice(m.index, m.index + 600);
            const dataPart = call.slice(call.indexOf("data:"));
            if (/\bstatus\s*:/.test(dataPart.split("})")[0] ?? ""))
              offenders.push(`${path.relative(root, full)}:${m.index}`);
          }
        }
      }
    };
    walk(path.join(root, "lib"));
    walk(path.join(root, "app"));
    expect(offenders).toEqual([]);
  });
});
