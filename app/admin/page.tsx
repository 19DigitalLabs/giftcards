import Link from "next/link";
import { adminRunProcessorAction } from "@/lib/actions/admin";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/fulfilment/providers";
import { formatINR } from "@/lib/money";
import { AdminMessage, Stat } from "@/components/admin-ui";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { msg } = await searchParams;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [ordersToday, captured, byStatus, openIssues, providers] =
    await Promise.all([
      db.order.count({ where: { createdAt: { gte: startOfDay } } }),
      db.ledgerEntry.aggregate({
        _sum: { amountPaise: true },
        where: { type: "PAYMENT_CAPTURED", createdAt: { gte: startOfDay } },
      }),
      db.order.groupBy({ by: ["status"], _count: { _all: true } }),
      db.reconciliationIssue.count({ where: { status: "OPEN" } }),
      db.provider.findMany({ where: { status: "ACTIVE" } }),
    ]);
  const count = (s: string) =>
    byStatus.find((b) => b.status === s)?._count._all ?? 0;

  const balances = await Promise.all(
    providers.map(async (p) => {
      try {
        const adapter = getProvider(p.code);
        const b = adapter.getBalance ? await adapter.getBalance() : null;
        return {
          name: p.name,
          isDemo: p.isDemo,
          balance: b?.availablePaise ?? null,
        };
      } catch {
        return { name: p.name, isDemo: p.isDemo, balance: null };
      }
    }),
  );

  return (
    <div>
      <AdminMessage msg={msg} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-extrabold">Dashboard</h1>
        <form action={adminRunProcessorAction}>
          <SubmitButton variant="outline" pendingLabel="Running…">
            Run processor now
          </SubmitButton>
        </form>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Orders today" value={ordersToday} />
        <Stat
          label="Captured today"
          value={formatINR(captured._sum.amountPaise ?? 0)}
        />
        <Stat label="Fulfilled" value={count("FULFILLED")} tone="ok" />
        <Stat
          label="Pending fulfilment"
          value={
            count("PAID") + count("FULFILLING") + count("FULFILMENT_PENDING")
          }
        />
        <Stat
          label="Failed fulfilment"
          value={count("FULFILMENT_FAILED")}
          tone={count("FULFILMENT_FAILED") ? "warn" : undefined}
        />
        <Stat
          label="Manual review"
          value={count("MANUAL_REVIEW")}
          tone={count("MANUAL_REVIEW") ? "warn" : undefined}
        />
        <Stat
          label="Refund pending"
          value={count("REFUND_PENDING")}
          tone={count("REFUND_PENDING") ? "warn" : undefined}
        />
        <Stat label="Refunded" value={count("REFUNDED")} />
        <Stat
          label="Open reconciliation issues"
          value={
            <Link href="/admin/reconciliation" className="hover:underline">
              {openIssues}
            </Link>
          }
          tone={openIssues ? "warn" : "ok"}
        />
        {balances.map((b) => (
          <Stat
            key={b.name}
            label={
              b.isDemo
                ? "Demo provider balance (simulated)"
                : `${b.name} balance`
            }
            value={b.balance === null ? "unavailable" : formatINR(b.balance)}
          />
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Quick links:{" "}
        <Link
          href="/admin/orders?status=MANUAL_REVIEW"
          className="text-primary hover:underline"
        >
          manual review
        </Link>{" "}
        ·{" "}
        <Link
          href="/admin/orders?status=FULFILMENT_PENDING"
          className="text-primary hover:underline"
        >
          pending fulfilment
        </Link>{" "}
        ·{" "}
        <Link
          href="/admin/orders?status=REFUND_PENDING"
          className="text-primary hover:underline"
        >
          refund pending
        </Link>
      </p>
    </div>
  );
}
