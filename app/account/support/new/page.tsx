import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { TICKET_CATEGORIES } from "@/lib/support";
import { NewTicketForm } from "@/components/account-forms";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Raise a ticket" };

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/account/support/new");
  const { order } = await searchParams;
  const orders = await db.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { items: { select: { brandName: true } } },
  });
  const defaultOrderId =
    typeof order === "string" && orders.some((o) => o.id === order)
      ? order
      : undefined;

  return (
    <Card>
      <Link
        href="/account/support"
        className="text-xs font-bold text-muted-foreground hover:text-primary"
      >
        ← Support tickets
      </Link>
      <h2 className="mt-2 font-display text-xl font-extrabold">
        Raise a ticket
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        We usually reply within one working day.
      </p>
      <div className="mt-6">
        <NewTicketForm
          categories={Object.entries(TICKET_CATEGORIES).map(
            ([value, label]) => ({ value, label }),
          )}
          orders={orders.map((o) => ({
            id: o.id,
            label: `${o.id} · ${[...new Set(o.items.map((i) => i.brandName))].join(", ")} · ${formatINR(o.totalPaise)}`,
          }))}
          defaultOrderId={defaultOrderId}
        />
      </div>
    </Card>
  );
}
