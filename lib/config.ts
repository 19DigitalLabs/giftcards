import { createHash } from "node:crypto";

/*
 * Application configuration — the single place that reads process.env for
 * server settings, and the place that FAILS CLOSED.
 *
 * APP_MODE decides what is allowed, not NODE_ENV: Vercel preview/demo
 * deployments run production builds too, so "production build" can't mean
 * "real money".
 *
 *   demo  simulated payment gateway / gift-card provider / email allowed;
 *         every page carries a DEMO banner and vouchers are TEST vouchers.
 *   live  real customers and money: demo adapters are refused, all secrets
 *         and SITE_URL are required, and the app won't start otherwise.
 *
 * Secret fallbacks exist ONLY for local development (NODE_ENV !== production,
 * APP_MODE=demo) so `pnpm dev` works out of the box. Any deployed build
 * must set real secrets, even in demo mode.
 */

export type AppMode = "demo" | "live";

export class ConfigError extends Error {}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProductionBuild = nodeEnv === "production";

function readMode(): AppMode {
  const raw = process.env.APP_MODE?.trim().toLowerCase();
  if (raw === "demo" || raw === "live") return raw;
  if (raw)
    throw new ConfigError(`APP_MODE must be "demo" or "live" (got "${raw}").`);
  // Deployed builds must say what they are; local dev/test defaults to demo.
  if (isProductionBuild) {
    throw new ConfigError(
      'APP_MODE is required for production builds ("demo" or "live").',
    );
  }
  return "demo";
}

export function appMode(): AppMode {
  return readMode();
}

export function isDemoMode(): boolean {
  return readMode() === "demo";
}

/** Local dev/test on a developer machine (the only place fallbacks apply). */
function allowsDevFallbacks(): boolean {
  return !isProductionBuild && readMode() === "demo";
}

function secret(name: string, devFallbackSeed: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (allowsDevFallbacks()) {
    return createHash("sha256")
      .update(`gifts19-local-dev:${devFallbackSeed}`)
      .digest("hex");
  }
  throw new ConfigError(`Missing required environment variable ${name}.`);
}

/** 32-byte AES key for voucher codes, from VOUCHER_ENCRYPTION_KEY (64 hex chars). */
export function voucherKey(): Buffer {
  const hex = secret("VOUCHER_ENCRYPTION_KEY", "voucher-key");
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new ConfigError(
      "VOUCHER_ENCRYPTION_KEY must be 64 hex characters (32 bytes).",
    );
  }
  return Buffer.from(hex, "hex");
}

/** Shared secret the payment gateway signs return redirects and webhooks with. */
export function paymentWebhookSecret(): string {
  return secret("PAYMENT_WEBHOOK_SECRET", "payment-webhook");
}

/** Bearer token protecting /api/internal/* (Vercel Cron sends CRON_SECRET). */
export function cronSecret(): string {
  return secret("CRON_SECRET", "cron");
}

/**
 * The canonical public origin, no trailing slash. Used for payment return
 * URLs and email links — NEVER derived from request Host headers, which an
 * attacker controls.
 */
export function siteUrl(): string {
  const configured =
    process.env.SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (readMode() === "live")
    throw new ConfigError("SITE_URL is required in live mode.");
  // Demo on Vercel: production builds use the project's public production
  // domain (the per-deployment URL sits behind Deployment Protection, which
  // breaks emailed links); previews use their own URL. Locally, localhost.
  if (
    process.env.VERCEL_ENV === "production" &&
    process.env.VERCEL_PROJECT_PRODUCTION_URL
  ) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_BRANCH_URL)
    return `https://${process.env.VERCEL_BRANCH_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3001";
}

export function paymentGatewayCode(): string {
  return (process.env.PAYMENT_GATEWAY?.trim() || "demo").toLowerCase();
}

export function giftCardProviderCode(): string {
  return (process.env.GIFT_CARD_PROVIDER?.trim() || "DEMO").toUpperCase();
}

export function emailProviderCode(): string {
  return (process.env.EMAIL_PROVIDER?.trim() || "demo").toLowerCase();
}

/** Convenience fee charged on top of the selling price (bps). Default 0. */
export function convenienceFeeBps(): number {
  const raw = Number(process.env.CONVENIENCE_FEE_BPS ?? 0);
  return Number.isInteger(raw) && raw >= 0 && raw <= 1000 ? raw : 0;
}

/**
 * Whether proxy-supplied client IP headers can be trusted for rate limiting.
 * Vercel sets x-real-ip itself; elsewhere only when TRUST_PROXY_HEADERS=true.
 */
export function trustedIpHeader(): "x-real-ip" | "x-forwarded-for" | null {
  if (process.env.VERCEL === "1") return "x-real-ip";
  if (process.env.TRUST_PROXY_HEADERS === "true") return "x-forwarded-for";
  return null;
}

/**
 * Validates the whole configuration. Called at server start
 * (instrumentation.ts) and by the health check; throws ConfigError on any
 * unsafe combination so a live deployment can't come up half-configured.
 */
export function assertSafeConfig(): void {
  const mode = readMode();
  const problems: string[] = [];
  const check = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  };

  check(voucherKey);
  check(paymentWebhookSecret);
  check(cronSecret);
  check(siteUrl);
  if (emailProviderCode() === "brevo") {
    if (!process.env.BREVO_API_KEY?.trim())
      problems.push("BREVO_API_KEY is required when EMAIL_PROVIDER=brevo.");
    if (!process.env.EMAIL_FROM?.trim())
      problems.push("EMAIL_FROM is required when EMAIL_PROVIDER=brevo.");
  }
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is required.");

  if (mode === "live") {
    if (paymentGatewayCode() === "demo")
      problems.push("PAYMENT_GATEWAY=demo is not allowed in live mode.");
    if (giftCardProviderCode() === "DEMO")
      problems.push("GIFT_CARD_PROVIDER=DEMO is not allowed in live mode.");
    if (emailProviderCode() === "demo")
      problems.push("EMAIL_PROVIDER=demo is not allowed in live mode.");
    if (!siteUrlIsHttps())
      problems.push("SITE_URL must be https:// in live mode.");
  }

  if (problems.length > 0) {
    throw new ConfigError(
      `Unsafe configuration (APP_MODE=${mode}):\n- ${problems.join("\n- ")}`,
    );
  }
}

function siteUrlIsHttps(): boolean {
  try {
    return siteUrl().startsWith("https://");
  } catch {
    return false;
  }
}
