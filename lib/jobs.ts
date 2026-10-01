import { runFulfilmentBatch } from "./fulfilment/service";
import { log } from "./log";
import { processPendingRefunds } from "./payments/refunds";
import { pollPayments } from "./payments/service";
import { pruneRateLimits } from "./rate-limit";

/*
 * The scheduled "worker". Vercel functions are short-lived, so there is no
 * always-on process: Vercel Cron calls /api/internal/cron/process, which
 * runs one small, time-boxed batch of each job. Every job is resumable and
 * idempotent (DB leases + conditional updates), so overlapping or repeated
 * runs are safe.
 */
export async function runScheduledWork(budgetMs = 45_000) {
  const started = Date.now();
  const payments = await pollPayments(25);
  const fulfilment = await runFulfilmentBatch({
    limit: 10,
    budgetMs: Math.max(5_000, budgetMs - (Date.now() - started)),
  });
  const refunds = await processPendingRefunds(10);
  const prunedRateLimits = await pruneRateLimits();
  const summary = {
    payments,
    fulfilment: fulfilment.considered,
    refunds,
    prunedRateLimits,
    ms: Date.now() - started,
  };
  log.info("jobs.run", summary);
  return summary;
}
