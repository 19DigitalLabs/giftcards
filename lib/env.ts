import { createHash } from "node:crypto";

/*
 * Server-side secrets. Production refuses to run without real values; dev
 * falls back to fixed, obviously-fake ones so `pnpm dev` works out of the box.
 * Read lazily (functions, not constants) so `next build` doesn't need them.
 */

const isProd = process.env.NODE_ENV === "production";

function required(name: string, devFallback: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isProd) throw new Error(`Missing required environment variable ${name}.`);
  return devFallback;
}

/** 32-byte AES key for voucher codes, from VOUCHER_ENCRYPTION_KEY (64 hex chars). */
export function voucherKey(): Buffer {
  const hex = required(
    "VOUCHER_ENCRYPTION_KEY",
    createHash("sha256").update("gifts19-dev-only-voucher-key").digest("hex"),
  );
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(
      "VOUCHER_ENCRYPTION_KEY must be 64 hex characters (32 bytes).",
    );
  }
  return Buffer.from(hex, "hex");
}

/** Shared secret the payment gateway signs return redirects and webhooks with. */
export function paymentWebhookSecret(): string {
  return required("PAYMENT_WEBHOOK_SECRET", "gifts19-dev-only-webhook-secret");
}

/** Which adapter in lib/gateway handles payments. */
export function paymentGatewayId(): string {
  return process.env.PAYMENT_GATEWAY?.trim() || "mock";
}

/**
 * The mock gateway hands out vouchers without taking money, so production
 * only allows it behind an explicit opt-in (e.g. a staging deploy).
 */
export function mockPaymentsAllowed(): boolean {
  return !isProd || process.env.ALLOW_MOCK_PAYMENTS === "true";
}
