import { isAuthorizedCron } from "@/lib/internal-auth";
import { log } from "@/lib/log";
import { runReconciliation } from "@/lib/reconciliation/service";

/* Vercel Cron → three-way reconciliation (ours vs gateway vs provider). */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function run(request: Request) {
  if (!isAuthorizedCron(request))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await runReconciliation("CRON")) });
  } catch (error) {
    log.error("cron.reconcile_failed", { error });
    return Response.json({ ok: false }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
