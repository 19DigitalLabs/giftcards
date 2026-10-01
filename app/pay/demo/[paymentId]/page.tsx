import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { demoGatewayAction } from "@/lib/actions/demo-gateway";
import { isDemoMode } from "@/lib/config";
import {
  apiGetPayment,
  DEMO_PAYMENT_SCENARIOS,
} from "@/lib/demo/gateway-server";
import { getDemoControl } from "@/lib/demo/provider-server";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/components/submit-button";
import { buttonClasses, Notice, Section } from "@/components/ui";

export const metadata: Metadata = {
  title: "DemoPay — test payment",
  robots: { index: false },
};

/**
 * The simulated gateway's hosted payment page — stands in for the page a
 * real gateway (Razorpay/Cashfree/PayU) would host on its own domain.
 */
export default async function DemoGatewayPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isDemoMode()) notFound();
  const { paymentId } = await params;
  const { error } = await searchParams;
  const payment = await apiGetPayment(paymentId);
  if (!payment) notFound();
  const armed = (await getDemoControl()).paymentScenario;
  const used = payment.status !== "CREATED";

  return (
    <Section containerClassName="max-w-lg">
      <div className="overflow-hidden rounded-3xl border border-cyan/40 bg-card">
        <div className="flex items-center justify-between bg-cyan/10 px-6 py-4">
          <p className="font-display text-lg font-extrabold">
            Demo<span className="text-cyan">Pay</span>
          </p>
          <span className="rounded-full bg-orange/20 px-3 py-1 text-xs font-extrabold text-orange">
            TEST PAYMENT
          </span>
        </div>
        <div className="p-6">
          <p className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
            Gifts19 demo payment gateway
          </p>
          <p className="mt-2 font-display text-4xl font-extrabold">
            {formatINR(payment.amountPaise)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Order reference{" "}
            <span className="font-mono">{payment.orderRef}</span>
          </p>
          <Notice variant="info" className="mt-4 text-xs">
            No money will be charged. Choose what the bank should do.
          </Notice>
          {typeof error === "string" && (
            <Notice variant="error" className="mt-3 text-xs">
              {error.slice(0, 200)}
            </Notice>
          )}

          {used ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                This payment has already been processed (
                {payment.status.toLowerCase()}).
              </p>
              <Link
                href={`/payment/status/${payment.orderRef}`}
                className={buttonClasses({ className: "w-full" })}
              >
                Return to Gifts19
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-2.5">
              {DEMO_PAYMENT_SCENARIOS.map((s) => (
                <form
                  key={s.id}
                  action={demoGatewayAction.bind(null, paymentId, s.id)}
                >
                  <SubmitButton
                    variant={
                      s.id === (armed ?? "SUCCESS") ? "primary" : "outline"
                    }
                    className={cn(
                      "h-auto w-full flex-col items-start gap-0 rounded-2xl px-5 py-3 text-left",
                    )}
                    pendingLabel="Contacting bank…"
                  >
                    <span>{s.label}</span>
                    <span className="text-xs font-normal opacity-75">
                      {s.note}
                    </span>
                  </SubmitButton>
                </form>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Simulated gateway for testing. A real gateway replaces this page in live
        mode.
      </p>
    </Section>
  );
}
