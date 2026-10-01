/*
 * Fixed-window rate limiter held in memory. Good for a single server process;
 * with several instances, move the buckets to Redis/Upstash.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets (when blocked). */
  retryAfter: number;
}

/** Counts one hit against `key`; blocks after `limit` hits per `windowMs`. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    ok: bucket.count <= limit,
    retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** "Too many attempts" copy with a human wait time. */
export function tooManyAttempts(retryAfter: number): string {
  const minutes = Math.ceil(retryAfter / 60);
  return `Too many attempts — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
