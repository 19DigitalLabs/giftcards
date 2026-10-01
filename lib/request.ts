import { headers } from "next/headers";
import { trustedIpHeader } from "./config";

/**
 * Client IP for rate-limit keys, read only from a header the deployment
 * vouches for (Vercel's x-real-ip, or X-Forwarded-For when
 * TRUST_PROXY_HEADERS=true behind your own proxy). Anything else is
 * client-spoofable, so without one this returns null and callers skip
 * IP-based limits — per-email/per-account limits and lockout still apply.
 * (Bucketing every visitor under one key would let a handful of requests
 * lock out the whole site.)
 */
export async function clientIp(): Promise<string | null> {
  const header = trustedIpHeader();
  if (!header) return null;
  const value = (await headers()).get(header);
  return value?.split(",")[0]?.trim() || null;
}
