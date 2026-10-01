import { db } from "./db";
import { UserFacingError } from "./errors";

/*
 * Fixed-window rate limiter stored in Postgres, so it holds across Vercel's
 * many short-lived function instances (an in-memory Map would reset per
 * instance). One atomic upsert per hit; no Redis needed at MVP scale.
 *
 * Times are UTC: Prisma stores DateTime as UTC in timestamp-without-time-
 * zone columns, so raw SQL must use timezone('UTC', now()), not now().
 */

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowSeconds = Math.ceil(windowMs / 1000);
  const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, timezone('UTC', now()) + make_interval(secs => ${windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimitBucket"."resetAt" <= timezone('UTC', now()) THEN 1
                       ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= timezone('UTC', now())
                       THEN timezone('UTC', now()) + make_interval(secs => ${windowSeconds})
                       ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count", "resetAt"`;
  const row = rows[0]!;
  return {
    ok: row.count <= limit,
    retryAfter: Math.max(
      1,
      Math.ceil((row.resetAt.getTime() - Date.now()) / 1000),
    ),
  };
}

/** "Too many attempts" copy with a human wait time. */
export function tooManyAttempts(retryAfter: number): string {
  const minutes = Math.ceil(retryAfter / 60);
  return `Too many attempts — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/** rateLimit that throws a customer-safe error when exceeded. */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
) {
  const result = await rateLimit(key, limit, windowMs);
  if (!result.ok)
    throw new UserFacingError(
      tooManyAttempts(result.retryAfter),
      "RATE_LIMITED",
    );
}

/** Drops expired buckets (called from the maintenance cron). */
export async function pruneRateLimits(): Promise<number> {
  const { count } = await db.rateLimitBucket.deleteMany({
    where: { resetAt: { lt: new Date() } },
  });
  return count;
}
