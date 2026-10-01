import Link from "next/link";
import {
  adminResolveIssueAction,
  adminRunReconciliationAction,
} from "@/lib/actions/admin";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminMessage, smallButton, Table, td } from "@/components/admin-ui";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

export default async function AdminReconciliation({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "ADMIN";
  const { msg, all } = await searchParams;
  const issues = await db.reconciliationIssue.findMany({
    where: all ? {} : { status: "OPEN" },
    orderBy: [{ status: "asc" }, { severity: "asc" }, { lastSeenAt: "desc" }],
    take: 200,
  });

  return (
    <div>
      <AdminMessage msg={msg} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-extrabold">Reconciliation</h1>
        {isAdmin && (
          <form action={adminRunReconciliationAction}>
            <SubmitButton pendingLabel="Reconciling…">
              Run reconciliation now
            </SubmitButton>
          </form>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Our records vs the payment gateway vs the gift-card provider.
        Discrepancies are recorded for humans — never auto-fixed.{" "}
        <Link
          href={all ? "/admin/reconciliation" : "/admin/reconciliation?all=1"}
          className="text-primary hover:underline"
        >
          {all ? "Show open only" : "Show resolved too"}
        </Link>
      </p>
      <div className="mt-6">
        <Table
          head={[
            "Severity",
            "Type",
            "Order",
            "Details",
            "Status",
            "Last seen",
            "",
          ]}
        >
          {issues.map((i) => (
            <tr key={i.id}>
              <td
                className={`${td} font-bold ${i.severity === "CRITICAL" ? "text-pink" : ""}`}
              >
                {i.severity}
              </td>
              <td className={`${td} font-mono text-xs`}>{i.type}</td>
              <td className={td}>
                {i.orderId ? (
                  <Link
                    href={`/admin/orders/${i.orderId}`}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {i.orderId}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td
                className={`${td} max-w-sm font-mono text-[11px] break-all text-muted-foreground`}
              >
                {i.details ? JSON.stringify(i.details) : ""}
              </td>
              <td className={td}>{i.status}</td>
              <td className={`${td} text-xs`}>
                {i.lastSeenAt.toLocaleString("en-IN")}
              </td>
              <td className={td}>
                {isAdmin && i.status === "OPEN" && (
                  <form action={adminResolveIssueAction.bind(null, i.id)}>
                    <button className={smallButton}>Mark resolved</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
        {issues.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            No issues. Everything reconciles.
          </p>
        )}
      </div>
    </div>
  );
}
