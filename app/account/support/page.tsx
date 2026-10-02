import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  TICKET_CATEGORIES,
  TICKET_STATUS_LABEL,
  type TicketCategory,
} from "@/lib/support";
import { formatDate } from "@/lib/utils";
import { buttonClasses, Card, Tag } from "@/components/ui";

export const metadata: Metadata = { title: "Support tickets" };

export default async function SupportTicketsPage() {
  const user = await requireUser("/account/support");
  const tickets = await db.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold">
            Support tickets
          </h2>
          <p className="text-sm text-muted-foreground">
            Questions about an order, a payment or your account.
          </p>
        </div>
        <Link
          href="/account/support/new"
          className={buttonClasses({ size: "sm" })}
        >
          Raise a ticket
        </Link>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            You haven&apos;t raised any tickets. We&apos;re here if you need us.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/account/support/${t.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold">{t.subject}</span>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono">{t.id}</span> ·{" "}
                    {TICKET_CATEGORIES[t.category as TicketCategory] ??
                      t.category}{" "}
                    · updated {formatDate(t.updatedAt.toISOString(), "en-IN")}
                    {t.orderId && (
                      <>
                        {" "}
                        · order <span className="font-mono">{t.orderId}</span>
                      </>
                    )}
                  </span>
                </span>
                <Tag
                  variant={
                    t.status === "AWAITING_CUSTOMER"
                      ? "pink"
                      : t.status === "OPEN"
                        ? "violet"
                        : "neutral"
                  }
                >
                  {TICKET_STATUS_LABEL[t.status]}
                </Tag>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
