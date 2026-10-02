import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import {
  getOwnTicket,
  TICKET_CATEGORIES,
  TICKET_STATUS_LABEL,
  type TicketCategory,
} from "@/lib/support";
import { cn } from "@/lib/utils";
import { TicketReplyForm } from "@/components/account-forms";
import { Card, Notice, Tag } from "@/components/ui";

export const metadata: Metadata = { title: "Support ticket" };

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const user = await requireUser(`/account/support/${id}`);
  let ticket;
  try {
    ticket = await getOwnTicket(user.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      {created && (
        <Notice variant="success">
          Ticket created — we&apos;ve emailed you a copy and will reply soon.
        </Notice>
      )}
      <Card>
        <Link
          href="/account/support"
          className="text-xs font-bold text-muted-foreground hover:text-primary"
        >
          ← Support tickets
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-extrabold">
              {ticket.subject}
            </h2>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{ticket.id}</span> ·{" "}
              {TICKET_CATEGORIES[ticket.category as TicketCategory] ??
                ticket.category}
              {ticket.orderId && (
                <>
                  {" "}
                  · order{" "}
                  <Link
                    href={`/orders/${ticket.orderId}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {ticket.orderId}
                  </Link>
                </>
              )}
            </p>
          </div>
          <Tag
            variant={
              ticket.status === "AWAITING_CUSTOMER"
                ? "pink"
                : ticket.status === "OPEN"
                  ? "violet"
                  : "neutral"
            }
          >
            {TICKET_STATUS_LABEL[ticket.status]}
          </Tag>
        </div>

        <ol className="mt-6 space-y-3">
          {ticket.messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                m.author === "CUSTOMER" ? "ml-auto bg-primary/10" : "bg-muted",
              )}
            >
              <p className="text-xs font-bold text-muted-foreground">
                {m.author === "CUSTOMER" ? "You" : "Gifts19 support"} ·{" "}
                {m.createdAt.toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ol>
      </Card>

      {ticket.status === "CLOSED" ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            This ticket is closed.{" "}
            <Link
              href="/account/support/new"
              className="font-bold text-primary hover:underline"
            >
              Raise a new ticket
            </Link>{" "}
            if you still need help.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="max-w-xl">
            <TicketReplyForm ticketId={ticket.id} />
          </div>
        </Card>
      )}
    </div>
  );
}
