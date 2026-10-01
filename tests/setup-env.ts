import { readFileSync } from "node:fs";
import path from "node:path";

/* Runs in each test worker before any app module is imported. */
const url = readFileSync(path.resolve(".local/test-db-url"), "utf8").trim();
Object.assign(process.env, {
  APP_MODE: "demo",
  DATABASE_URL: url,
  DIRECT_URL: url,
  SITE_URL: "http://localhost:3001",
  VOUCHER_ENCRYPTION_KEY: "a".repeat(64),
  PAYMENT_WEBHOOK_SECRET: "test-webhook-secret",
  CRON_SECRET: "test-cron-secret",
  PAYMENT_GATEWAY: "demo",
  GIFT_CARD_PROVIDER: "DEMO",
  EMAIL_PROVIDER: "demo",
  LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "silent",
});
