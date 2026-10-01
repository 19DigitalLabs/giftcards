import { appMode, assertSafeConfig } from "@/lib/config";
import { db } from "@/lib/db";

/* Liveness/readiness: minimal, no secrets or config values. */
export const dynamic = "force-dynamic";

export async function GET() {
  let database = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }
  let config = "ok";
  try {
    assertSafeConfig();
  } catch {
    config = "invalid";
  }
  const healthy = database === "ok" && config === "ok";
  return Response.json(
    { status: healthy ? "ok" : "degraded", database, config, mode: safeMode() },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}

function safeMode() {
  try {
    return appMode();
  } catch {
    return "unknown";
  }
}
