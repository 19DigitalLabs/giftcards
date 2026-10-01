import { headers } from "next/headers";

/**
 * This deployment's origin for absolute links (gateway return URLs, emails):
 * NEXT_PUBLIC_SITE_URL when set, else the request's own host — so testing
 * from a phone on the LAN comes back to the LAN address, not localhost.
 */
export async function requestOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Best-effort client IP (first X-Forwarded-For hop behind a proxy). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
