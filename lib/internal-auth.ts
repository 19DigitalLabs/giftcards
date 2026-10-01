import { cronSecret } from "./config";
import { safeEqual } from "./crypto";

/**
 * Authorises internal/cron endpoints. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET` automatically when the env var is set.
 */
export function isAuthorizedCron(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  let expected: string;
  try {
    expected = `Bearer ${cronSecret()}`;
  } catch {
    return false; // no secret configured → nothing is authorised
  }
  return safeEqual(header, expected);
}
