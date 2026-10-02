import Link from "next/link";
import { notFound } from "next/navigation";
import { staffReplyAction } from "@/lib/actions/account";
import { db } from "@/lib/db";
import {
  TICKET_CATEGORIES,
  TICKET_STATUS_LABEL,
  type TicketCategory,
} from "@/lib/support";
import { cn } from "@/lib/utils";
import { AdminMessage } from "@/components/admin-ui";
import { SubmitButton } from "@/components/submit-button";
import { Card, inputClasses, textareaClasses } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminTicket({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { msg } = await searchParams;
  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) notFound();

  return (
    <div className="max-w-3xl">
      <AdminMessage msg={msg} />
      <Link
        href="/admin/support"
        className="text-xs font-bold text-muted-foreground hover:text-primary"
      >
        ← All tickets
      </Link>
      <h1 className="mt-2 font-display text-2xl font-extrabold">
        {ticket.subject}
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-mono">{ticket.id}</span> · {ticket.user.name} (
        {ticket.user.email}) ·{" "}
        {TICKET_CATEGORIES[ticket.category as TicketCategory] ??
          ticket.category}{" "}
        · {TICKET_STATUS_LABEL[ticket.status]}
        {ticket.orderId && (
          <>
            {" "}
            · order{" "}
            <Link
              href={`/admin/orders/${ticket.orderId}`}
              className="font-mono text-primary hover:underline"
            >
              {ticket.orderId}
            </Link>
          </>
        )}
      </p>

      <ol className="mt-6 space-y-3">
        {ticket.messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
              m.author === "STAFF" ? "ml-auto bg-primary/10" : "bg-muted",
            )}
          >
            <p className="text-xs font-bold text-muted-foreground">
              {m.author === "STAFF" ? "Staff" : "Customer"} ·{" "}
              {m.createdAt.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>

      <Card className="mt-6">
        <form
          action={staffReplyAction.bind(null, ticket.id)}
          className="space-y-3"
        >
          <label className="block text-sm font-bold">
            Reply{" "}
            <span className="font-normal text-muted-foreground">
              (optional — leave empty to only change status)
            </span>
            <textarea
              name="message"
              rows={4}
              maxLength={2000}
              className={`mt-1.5 ${textareaClasses}`}
            />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm font-bold">
              Set status
              <select
                name="status"
                defaultValue="AWAITING_CUSTOMER"
                className={`mt-1.5 w-56 ${inputClasses}`}
              >
                <option value="AWAITING_CUSTOMER">Awaiting customer</option>
                <option value="OPEN">Open</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
            </label>
            <SubmitButton size="sm" pendingLabel="Saving…">
              Save
            </SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
