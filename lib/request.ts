import { headers } from "next/headers";
import { trustedIpHeader } from "./config";

/**
 * Client IP for rate-limit keys, read only from a header the deployment
 * vouches for (Vercel's x-real-ip, or X-Forwarded-For when
 * TRUST_PROXY_HEADERS=true behind your own proxy). Anything else is
 * client-spoofable, so without one we bucket everyone as "direct" — the
 * per-account limits still apply.
 */
export async function clientIp(): Promise<string> {
  const header = trustedIpHeader();
  if (!header) return "direct";
  const value = (await headers()).get(header);
  return value?.split(",")[0]?.trim() || "unknown";
}
