import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { company } from "@/lib/company";
import { db } from "@/lib/db";
import { LegalPage } from "@/components/legal-page";
import { buttonClasses } from "@/components/ui";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { order } = await searchParams;
  const user = await getSessionUser();
  const recent = user
    ? await db.order.findMany({
        where: { userId: user.id },
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    : [];
  const orderId =
    typeof order === "string" && /^GC-[0-9A-F]{6,12}$/.test(order)
      ? order
      : recent[0]?.id;
  const subject = encodeURIComponent(`Help with order ${orderId ?? ""}`.trim());

  return (
    <LegalPage title="Support">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-5">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground">Fastest way to get help</p>
          <p>Raise a ticket and track our replies in your account.</p>
        </div>
        <Link
          href={
            user
              ? `/account/support/new${orderId ? `?order=${orderId}` : ""}`
              : "/login?next=%2Faccount%2Fsupport%2Fnew"
          }
          className={buttonClasses({ size: "sm" })}
        >
          Raise a ticket
        </Link>
      </div>
      <p>
        We&apos;re here {company.supportHours}. You can also email{" "}
        <strong>{company.supportEmail}</strong> — include your order ID so we
        can help quickly.
      </p>
      {orderId && (
        <p>
          <a
            href={`mailto:${company.supportEmail}?subject=${subject}`}
            className="font-bold text-primary underline"
          >
            Email support about order {orderId}
          </a>
        </p>
      )}
      {recent.length > 0 && (
        <p>
          Your recent orders:{" "}
          {recent.map((o, i) => (
            <span key={o.id}>
              {i > 0 && ", "}
              <Link
                href={`/orders/${o.id}`}
                className="font-mono text-primary underline"
              >
                {o.id}
              </Link>
            </span>
          ))}
        </p>
      )}
      <h2>Common questions</h2>
      <ul>
        <li>
          <strong>Paid but no gift card yet?</strong> Most orders complete in
          seconds; some take longer while our supplier confirms. Your order page
          updates automatically — there&apos;s nothing you need to do.
        </li>
        <li>
          <strong>Payment failed but money was debited?</strong> It&apos;s
          reversed automatically by your bank or our payment partner.
        </li>
        <li>
          <strong>Code doesn&apos;t work?</strong> Check the redemption steps on
          the brand&apos;s page, then contact us with your order ID.
        </li>
      </ul>
    </LegalPage>
  );
}
