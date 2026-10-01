import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatRupee } from "@/lib/utils";
import { mockGatewayAction } from "@/lib/actions/checkout";
import { db } from "@/lib/db";
import { mockPaymentsAllowed } from "@/lib/env";
import type { MockMeta, MockOutcome } from "@/lib/gateway/mock";
import { getPaymentMethod } from "@/lib/payments";
import { siteConfig } from "@/lib/site";
import { SubmitButton } from "@/components/submit-button";
import { buttonClasses, Section } from "@/components/ui";

export const metadata: Metadata = {
  title: "MockPay checkout",
  robots: { index: false },
};

const OUTCOMES: {
  outcome: MockOutcome;
  label: string;
  note: string;
  variant: "primary" | "outline";
}[] = [
  {
    outcome: "success",
    label: "✅ Pay successfully",
    note: "Bank approves instantly",
    variant: "primary",
  },
  {
    outcome: "pending-success",
    label: "⏳ Pending → succeeds",
    note: "Bank confirms after ~20s (like a slow UPI)",
    variant: "outline",
  },
  {
    outcome: "pending-failure",
    label: "⏳ Pending → fails",
    note: "Bank gives up after ~20s",
    variant: "outline",
  },
  {
    outcome: "failure",
    label: "❌ Payment fails",
    note: "Bank declines the payment",
    variant: "outline",
  },
];

/**
 * The mock gateway's hosted checkout page — what Razorpay/PayU would show.
 * Lives in this app only until a real gateway is integrated.
 */
export default async function MockGatewayPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  if (!mockPaymentsAllowed()) notFound();
  const payment = await db.payment.findUnique({
    where: { gatewayPaymentId: paymentId },
  });
  if (!payment || payment.gateway !== "mock") notFound();

  const used =
    payment.status !== "CREATED" ||
    Boolean((JSON.parse(payment.meta) as MockMeta).outcome);
  const method = getPaymentMethod(payment.method);

  return (
    <Section containerClassName="max-w-md">
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="flex items-center justify-between bg-foreground/5 px-6 py-4">
          <p className="font-display font-extrabold">
            Mock<span className="text-primary">Pay</span>
          </p>
          <span className="rounded-full bg-orange/20 px-3 py-1 text-xs font-bold text-orange">
            TEST MODE
          </span>
        </div>

        <div className="p-6">
          <p className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
            Paying {siteConfig.name}
          </p>
          <p className="mt-1 font-display text-4xl font-extrabold">
            {formatRupee(payment.amount)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Order {payment.orderId} ·{" "}
            {method ? `${method.emoji} ${method.label}` : payment.method}
          </p>

          {used ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                This payment link has already been used.
              </p>
              <Link
                href={`/payment/status/${payment.orderId}`}
                className={buttonClasses({ className: "w-full" })}
              >
                See payment status →
              </Link>
            </div>
          ) : (
            <>
              <p className="mt-6 text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
                Simulate the bank&apos;s response
              </p>
              <div className="mt-3 space-y-2.5">
                {OUTCOMES.map((o) => (
                  <form
                    key={o.outcome}
                    action={mockGatewayAction.bind(null, paymentId, o.outcome)}
                  >
                    <SubmitButton
                      variant={o.variant}
                      className="h-auto w-full flex-col gap-0 py-3"
                      pendingLabel="Contacting bank…"
                    >
                      <span>{o.label}</span>
                      <span className="text-xs font-normal opacity-75">
                        {o.note}
                      </span>
                    </SubmitButton>
                  </form>
                ))}
              </div>
              <form
                action={mockGatewayAction.bind(null, paymentId, "cancel")}
                className="mt-5 text-center"
              >
                <button
                  type="submit"
                  className="text-sm font-bold text-muted-foreground hover:text-foreground hover:underline"
                >
                  ← Cancel and return to {siteConfig.name}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Stand-in for a real payment gateway. No money moves.
      </p>
    </Section>
  );
}
