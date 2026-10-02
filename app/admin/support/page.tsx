import type { SupportTicketStatus } from "@prisma/client";
import Link from "next/link";
import { db } from "@/lib/db";
import { TICKET_CATEGORIES, type TicketCategory } from "@/lib/support";
import { cn } from "@/lib/utils";
import { Table, td } from "@/components/admin-ui";

export const dynamic = "force-dynamic";

const FILTERS: { label: string; value?: SupportTicketStatus }[] = [
  { label: "Open", value: "OPEN" },
  { label: "Awaiting customer", value: "AWAITING_CUSTOMER" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "Closed", value: "CLOSED" },
  { label: "All" },
];

export default async function AdminSupport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { status } = await searchParams;
  const filter =
    FILTERS.find((f) => f.value === status) ??
    (status === "all" ? FILTERS[4]! : FILTERS[0]!);
  const tickets = await db.supportTicket.findMany({
    where: filter.value ? { status: filter.value } : {},
    include: {
      user: { select: { email: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold">Support tickets</h1>
      <nav className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={`/admin/support?status=${f.value ?? "all"}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-bold",
              f === filter
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/50",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        <Table
          head={[
            "Ticket",
            "Customer",
            "Subject",
            "Topic",
            "Order",
            "Msgs",
            "Status",
            "Updated",
          ]}
        >
          {tickets.map((t) => (
            <tr key={t.id}>
              <td className={td}>
                <Link
                  href={`/admin/support/${t.id}`}
                  className="font-mono font-bold text-primary hover:underline"
                >
                  {t.id}
                </Link>
              </td>
              <td className={td}>{t.user.email}</td>
              <td className={`${td} max-w-xs truncate`}>{t.subject}</td>
              <td className={`${td} text-xs`}>
                {TICKET_CATEGORIES[t.category as TicketCategory] ?? t.category}
              </td>
              <td className={td}>
                {t.orderId ? (
                  <Link
                    href={`/admin/orders/${t.orderId}`}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {t.orderId}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className={td}>{t._count.messages}</td>
              <td className={`${td} font-mono text-xs`}>{t.status}</td>
              <td className={`${td} text-xs whitespace-nowrap`}>
                {t.updatedAt.toLocaleString("en-IN")}
              </td>
            </tr>
          ))}
        </Table>
        {tickets.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">No tickets here.</p>
        )}
      </div>
    </div>
  );
}
