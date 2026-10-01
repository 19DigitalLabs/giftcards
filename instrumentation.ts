/*
 * Runs once when a server instance starts. Fails closed: an unsafe live
 * configuration (demo adapters, missing secrets, no SITE_URL) stops the
 * server from serving traffic at all.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertSafeConfig } = await import("./lib/config");
  assertSafeConfig();
}
