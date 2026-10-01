import { isAuthorizedCron } from "@/lib/internal-auth";
import { runScheduledWork } from "@/lib/jobs";
import { log } from "@/lib/log";

/*
 * Vercel Cron → small, time-boxed batch of payment polling, fulfilment,
 * refunds and housekeeping. Safe to run concurrently or repeatedly.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function run(request: Request) {
  if (!isAuthorizedCron(request))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await runScheduledWork(45_000)) });
  } catch (error) {
    log.error("cron.process_failed", { error });
    return Response.json({ ok: false }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
