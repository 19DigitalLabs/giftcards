import { notFound } from "next/navigation";
import {
  adminCheckPaymentAction,
  adminCheckProviderAction,
  adminManualReviewAction,
  adminRefundAction,
  adminRetryFulfilmentAction,
} from "@/lib/actions/admin";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateMargin, formatINR } from "@/lib/money";
import { AdminMessage, smallButton, Table, td } from "@/components/admin-ui";
import { SubmitButton } from "@/components/submit-button";
import { Card, inputClasses } from "@/components/ui";

export const dynamic = "force-dynamic";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-lg font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

const when = (d: Date | null | undefined) =>
  d ? d.toLocaleString("en-IN") : "—";

export default async function AdminOrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "ADMIN";
  const { id } = await params;
  const { msg } = await searchParams;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true, status: true } },
      items: {
        include: {
          attempts: { orderBy: { attemptNumber: "asc" } },
          // Never the encrypted columns.
          vouchers: {
            select: {
              id: true,
              codeLast4: true,
              providerVoucherRef: true,
              status: true,
              isTest: true,
              issuedAt: true,
              expiresAt: true,
              revealedAt: true,
              deliveredAt: true,
              unitIndex: true,
            },
            orderBy: { unitIndex: "asc" },
          },
        },
      },
      payments: {
        orderBy: { createdAt: "asc" },
        include: { events: { orderBy: { receivedAt: "asc" } } },
      },
      refunds: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) notFound();
  const [ledger, auditTrail, issues] = await Promise.all([
    db.ledgerEntry.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "asc" },
    }),
    db.auditLog.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "asc" },
    }),
    db.reconciliationIssue.findMany({
      where: { orderId: id },
      orderBy: { detectedAt: "desc" },
    }),
  ]);
  const net = ledger.reduce((s, e) => s + e.amountPaise, 0);
  const sellingTotal = order.totalPaise - order.feePaise;

  return (
    <div>
      <AdminMessage msg={msg} />
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-mono text-2xl font-extrabold">{order.id}</h1>
        <span className="rounded-full bg-accent-soft px-3 py-1 font-mono text-xs font-bold">
          {order.status}
        </span>
        {order.isTest && (
          <span className="text-xs font-bold text-orange">TEST ORDER</span>
        )}
      </div>
      {order.statusReason && (
        <p className="mt-2 text-sm text-muted-foreground">
          Reason: {order.statusReason}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-xs font-bold text-muted-foreground">Customer</p>
          <p className="mt-1 font-bold">{order.user.name}</p>
          <p className="text-sm">{order.user.email}</p>
          <p className="text-xs text-muted-foreground">{order.user.status}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold text-muted-foreground">
            Economics (snapshot at checkout)
          </p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Face value</dt>
              <dd>{formatINR(order.faceValuePaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Selling price</dt>
              <dd>{formatINR(sellingTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Customer discount</dt>
              <dd>{formatINR(order.discountPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Payment fee</dt>
              <dd>{formatINR(order.feePaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Provider cost</dt>
              <dd>{formatINR(order.costPricePaise)}</dd>
            </div>
            <div className="flex justify-between font-bold">
              <dt>Gross margin</dt>
              <dd>
                {formatINR(calculateMargin(sellingTotal, order.costPricePaise))}
              </dd>
            </div>
          </dl>
        </Card>
        <Card>
          <p className="text-xs font-bold text-muted-foreground">Timeline</p>
          <dl className="mt-2 space-y-1 text-xs">
            {(
              [
                ["Created", order.createdAt],
                ["Paid", order.paidAt],
                ["Fulfilment started", order.fulfilmentStartedAt],
                ["Fulfilled", order.fulfilledAt],
                ["Failed", order.failedAt],
                ["Manual review", order.manualReviewAt],
                ["Refund started", order.refundStartedAt],
                ["Refunded", order.refundedAt],
                ["Cancelled", order.cancelledAt],
              ] as const
            )
              .filter(([, d]) => d)
              .map(([label, d]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt>{label}</dt>
                  <dd>{when(d)}</dd>
                </div>
              ))}
          </dl>
        </Card>
      </div>

      {isAdmin && (
        <Section title="Safe actions">
          <div className="flex flex-wrap gap-2">
            <form action={adminCheckProviderAction.bind(null, order.id)}>
              <SubmitButton
                variant="outline"
                size="sm"
                pendingLabel="Checking…"
              >
                Check provider status
              </SubmitButton>
            </form>
            {order.status === "MANUAL_REVIEW" && (
              <form action={adminRetryFulfilmentAction.bind(null, order.id)}>
                <SubmitButton
                  variant="outline"
                  size="sm"
                  pendingLabel="Retrying…"
                >
                  Retry fulfilment (only if provider confirmed not issued)
                </SubmitButton>
              </form>
            )}
            {(order.status === "MANUAL_REVIEW" ||
              order.status === "FULFILMENT_FAILED") && (
              <form action={adminRefundAction.bind(null, order.id)}>
                <SubmitButton
                  variant="outline"
                  size="sm"
                  pendingLabel="Refunding…"
                >
                  Initiate refund
                </SubmitButton>
              </form>
            )}
            <form
              action={adminManualReviewAction.bind(null, order.id)}
              className="flex gap-2"
            >
              <input
                name="reason"
                placeholder="Reason for manual review"
                className={`${inputClasses} h-9 w-64`}
              />
              <SubmitButton variant="ghost" size="sm" pendingLabel="Saving…">
                Move to manual review
              </SubmitButton>
            </form>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            There is intentionally no &quot;issue voucher again&quot; action —
            retries go through the idempotent fulfilment service.
          </p>
        </Section>
      )}

      <Section title="Items & fulfilment">
        {order.items.map((item) => (
          <Card key={item.id} className="mb-4">
            <p className="font-bold">
              {item.brandName} · {item.productName} × {item.quantity}{" "}
              <span className="font-mono text-xs text-muted-foreground">
                ({item.providerProductRef})
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Unit: face {formatINR(item.faceValuePaise)} · selling{" "}
              {formatINR(item.sellingPricePaise)} · cost{" "}
              {formatINR(item.costPricePaise)} · margin{" "}
              {formatINR(
                calculateMargin(item.sellingPricePaise, item.costPricePaise),
              )}
            </p>
            <div className="mt-3">
              <Table
                head={[
                  "#",
                  "Provider reference",
                  "Provider order",
                  "Status",
                  "Calls",
                  "Checks",
                  "Error",
                  "Requested",
                  "Responded",
                ]}
              >
                {item.attempts.map((a) => (
                  <tr key={a.id}>
                    <td className={td}>{a.attemptNumber}</td>
                    <td className={`${td} font-mono text-xs`}>
                      {a.providerReference}
                    </td>
                    <td className={`${td} font-mono text-xs`}>
                      {a.providerOrderRef ?? "—"}
                    </td>
                    <td className={`${td} font-mono text-xs`}>{a.status}</td>
                    <td className={td}>{a.placeCalls}</td>
                    <td className={td}>{a.statusChecks}</td>
                    <td className={`${td} text-xs`}>
                      {a.errorCode
                        ? `${a.errorCode}: ${a.errorMessage ?? ""}`
                        : "—"}
                    </td>
                    <td className={`${td} text-xs`}>{when(a.requestedAt)}</td>
                    <td className={`${td} text-xs`}>{when(a.respondedAt)}</td>
                  </tr>
                ))}
              </Table>
            </div>
            {item.vouchers.length > 0 && (
              <div className="mt-3">
                <Table
                  head={[
                    "Unit",
                    "Code",
                    "Provider voucher ref",
                    "Status",
                    "Issued",
                    "Expires",
                    "Revealed",
                    "Emailed",
                  ]}
                >
                  {item.vouchers.map((v) => (
                    <tr key={v.id}>
                      <td className={td}>{v.unitIndex + 1}</td>
                      <td className={`${td} font-mono`}>
                        •••• {v.codeLast4}
                        {v.isTest && (
                          <span className="ml-1 text-[10px] text-orange">
                            TEST
                          </span>
                        )}
                      </td>
                      <td className={`${td} font-mono text-xs`}>
                        {v.providerVoucherRef}
                      </td>
                      <td className={td}>{v.status}</td>
                      <td className={`${td} text-xs`}>{when(v.issuedAt)}</td>
                      <td className={`${td} text-xs`}>{when(v.expiresAt)}</td>
                      <td className={`${td} text-xs`}>{when(v.revealedAt)}</td>
                      <td className={`${td} text-xs`}>{when(v.deliveredAt)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        ))}
      </Section>

      <Section title="Payments">
        <Table
          head={[
            "Gateway payment id",
            "Amount",
            "Status",
            "Extra capture",
            "Events",
            "Created",
            "",
          ]}
        >
          {order.payments.map((p) => (
            <tr key={p.id}>
              <td className={`${td} font-mono text-xs`}>
                {p.gatewayPaymentId}
              </td>
              <td className={td}>
                {formatINR(p.amountPaise)} {p.currency}
              </td>
              <td className={`${td} font-mono text-xs`}>
                {p.status}
                {p.failureReason && (
                  <span className="block text-muted-foreground">
                    {p.failureReason}
                  </span>
                )}
              </td>
              <td className={td}>{p.isExtraCapture ? "YES" : "—"}</td>
              <td className={`${td} text-xs`}>
                {p.events
                  .map((e) => `${e.eventType} (${e.status})`)
                  .join(", ") || "—"}
              </td>
              <td className={`${td} text-xs`}>{when(p.createdAt)}</td>
              <td className={td}>
                {isAdmin && (
                  <form
                    action={adminCheckPaymentAction.bind(null, order.id, p.id)}
                  >
                    <button className={smallButton}>Check with gateway</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      {order.refunds.length > 0 && (
        <Section title="Refunds">
          <Table
            head={[
              "Payment",
              "Amount",
              "Status",
              "Reason",
              "Gateway refund id",
              "Attempts",
              "Created",
            ]}
          >
            {order.refunds.map((r) => (
              <tr key={r.id}>
                <td className={`${td} font-mono text-xs`}>
                  {r.paymentId.slice(-8)}
                </td>
                <td className={td}>{formatINR(r.amountPaise)}</td>
                <td className={`${td} font-mono text-xs`}>
                  {r.status}
                  {r.failureReason && (
                    <span className="block text-muted-foreground">
                      {r.failureReason}
                    </span>
                  )}
                </td>
                <td className={`${td} text-xs`}>{r.reason}</td>
                <td className={`${td} font-mono text-xs`}>
                  {r.gatewayRefundId ?? "—"}
                </td>
                <td className={td}>{r.attempts}</td>
                <td className={`${td} text-xs`}>{when(r.createdAt)}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      <Section title={`Ledger (net ${formatINR(net)})`}>
        <Table head={["Type", "Amount", "External ref", "When"]}>
          {ledger.map((e) => (
            <tr key={e.id}>
              <td className={`${td} font-mono text-xs`}>{e.type}</td>
              <td
                className={`${td} ${e.amountPaise < 0 ? "text-pink" : "text-primary"}`}
              >
                {formatINR(e.amountPaise)}
              </td>
              <td className={`${td} font-mono text-xs`}>
                {e.externalRef ?? "—"}
              </td>
              <td className={`${td} text-xs`}>{when(e.createdAt)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      {issues.length > 0 && (
        <Section title="Reconciliation issues">
          <Table head={["Type", "Severity", "Status", "Detected"]}>
            {issues.map((i) => (
              <tr key={i.id}>
                <td className={`${td} font-mono text-xs`}>{i.type}</td>
                <td className={td}>{i.severity}</td>
                <td className={td}>{i.status}</td>
                <td className={`${td} text-xs`}>{when(i.detectedAt)}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      <Section title="Audit timeline">
        <ol className="space-y-1.5 text-xs">
          {auditTrail.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap gap-x-3 rounded-xl bg-card px-3 py-2"
            >
              <span className="text-muted-foreground">
                {a.createdAt.toLocaleString("en-IN")}
              </span>
              <span className="font-mono font-bold">{a.action}</span>
              <span className="text-muted-foreground">{a.actorType}</span>
              <span className="font-mono break-all text-muted-foreground">
                {a.data ? JSON.stringify(a.data) : ""}
              </span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
