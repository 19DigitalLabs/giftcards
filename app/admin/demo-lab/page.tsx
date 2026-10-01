import { notFound } from "next/navigation";
import {
  labArmPaymentScenarioAction,
  labCatalogueAction,
  labProviderDownAction,
  labRefundFailNextAction,
  labSetBalanceAction,
  labSetIdempotencyAction,
  labSetProviderScenarioAction,
} from "@/lib/actions/demo-lab";
import { requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { db } from "@/lib/db";
import { DEMO_PAYMENT_SCENARIOS } from "@/lib/demo/gateway-server";
import {
  DEMO_PROVIDER_SCENARIOS,
  getDemoControl,
} from "@/lib/demo/provider-server";
import { formatINR } from "@/lib/money";
import { AdminMessage, smallButton } from "@/components/admin-ui";
import { SubmitButton } from "@/components/submit-button";
import { Card, inputClasses, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Demo lab — controls for the SIMULATED gateway and provider. Not present
 * in live mode; admin only.
 */
export default async function DemoLab({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isDemoMode()) notFound();
  await requireAdmin("/admin/demo-lab");
  const { msg } = await searchParams;
  const [control, account, brands, debits] = await Promise.all([
    getDemoControl(),
    db.demoProviderAccount.findUnique({ where: { id: "DEMO" } }),
    db.demoCatalogueBrand.findMany({ orderBy: { brandRef: "asc" } }),
    db.demoProviderDebit.aggregate({
      _sum: { amountPaise: true },
      _count: { _all: true },
    }),
  ]);
  const down =
    control.providerDownUntil && control.providerDownUntil > new Date();

  return (
    <div>
      <AdminMessage msg={msg} />
      <h1 className="font-display text-3xl font-extrabold">Demo lab</h1>
      <Notice variant="info" className="mt-3">
        These switches change what the simulated payment gateway and gift-card
        provider do next. Our order logic is not touched — it must cope with
        whatever the &quot;external&quot; systems do.
      </Notice>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-extrabold">
            Gift-card provider
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Next new provider order: <b>{control.providerScenario}</b>
            {control.providerSticky ? " (sticky)" : " (one-shot)"} · idempotency{" "}
            <b>{control.providerIdempotent ? "ON" : "OFF"}</b> ·{" "}
            {down ? <b className="text-pink">DOWN</b> : "up"}
          </p>
          <form
            action={labSetProviderScenarioAction}
            className="mt-4 space-y-2"
          >
            {DEMO_PROVIDER_SCENARIOS.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-muted"
              >
                <input
                  type="radio"
                  name="scenario"
                  value={s.id}
                  defaultChecked={s.id === control.providerScenario}
                  className="mt-1 accent-primary"
                />
                <span>
                  <b>{s.label}</b>
                  <span className="block text-xs text-muted-foreground">
                    {s.note}
                  </span>
                </span>
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="sticky"
                defaultChecked={control.providerSticky}
              />{" "}
              Keep applying (sticky)
            </label>
            <SubmitButton size="sm" pendingLabel="Saving…">
              Set provider behaviour
            </SubmitButton>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            <form
              action={labSetIdempotencyAction.bind(
                null,
                !control.providerIdempotent,
              )}
            >
              <button className={smallButton}>
                {control.providerIdempotent
                  ? "Make provider NON-idempotent"
                  : "Restore idempotency"}
              </button>
            </form>
            <form action={labProviderDownAction.bind(null, !down)}>
              <button className={smallButton}>
                {down ? "Bring provider up" : "Take provider down (60s)"}
              </button>
            </form>
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-extrabold">
            Demo provider balance (simulated)
          </h2>
          <p className="mt-2 font-display text-3xl font-extrabold">
            {formatINR(account?.balancePaise ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            {debits._count._all} debits totalling{" "}
            {formatINR(debits._sum.amountPaise ?? 0)}
          </p>
          <form action={labSetBalanceAction} className="mt-4 flex gap-2">
            <input
              name="rupees"
              type="number"
              min={0}
              placeholder="Balance in ₹"
              className={inputClasses}
            />
            <SubmitButton size="sm" pendingLabel="Saving…">
              Set
            </SubmitButton>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Set it below an order&apos;s cost to test INSUFFICIENT_BALANCE.
          </p>

          <h2 className="mt-8 font-display text-lg font-extrabold">
            Payment gateway
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every scenario is a button on the demo payment page. Arm one to make
            it the highlighted default. Armed:{" "}
            <b>{control.paymentScenario ?? "none (Success)"}</b>
          </p>
          <form
            action={labArmPaymentScenarioAction}
            className="mt-3 flex gap-2"
          >
            <select
              name="scenario"
              defaultValue={control.paymentScenario ?? ""}
              className={inputClasses}
            >
              <option value="">None</option>
              {DEMO_PAYMENT_SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <SubmitButton size="sm" pendingLabel="Saving…">
              Arm
            </SubmitButton>
          </form>
          <form action={labRefundFailNextAction} className="mt-3">
            <button className={smallButton} disabled={control.refundFailNext}>
              {control.refundFailNext
                ? "Next refund will FAIL"
                : "Make the next refund fail"}
            </button>
          </form>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="font-display text-lg font-extrabold">
          Demo supplier catalogue
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Change the simulated supplier&apos;s own catalogue, then use{" "}
          <b>Catalogue → Sync</b>. Existing orders keep their snapshot prices.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <form action={labCatalogueAction} className="space-y-2">
            <input type="hidden" name="op" value="add-denomination" />
            <p className="text-sm font-bold">Add a denomination</p>
            <div className="flex gap-2">
              <select name="brandRef" className={inputClasses}>
                {brands.map((b) => (
                  <option key={b.brandRef} value={b.brandRef}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input
                name="rupees"
                type="number"
                placeholder="₹"
                className={`${inputClasses} w-28`}
              />
              <button className={smallButton}>Add</button>
            </div>
          </form>
          <form action={labCatalogueAction} className="space-y-2">
            <input type="hidden" name="op" value="product-status" />
            <p className="text-sm font-bold">
              Change a product&apos;s availability
            </p>
            <div className="flex gap-2">
              <input
                name="productRef"
                placeholder="e.g. AMAZONPAY-5000"
                className={inputClasses}
              />
              <select name="status" className={`${inputClasses} w-40`}>
                <option>DISABLED</option>
                <option>OUT_OF_STOCK</option>
                <option>ACTIVE</option>
              </select>
              <button className={smallButton}>Apply</button>
            </div>
          </form>
          <form action={labCatalogueAction} className="space-y-2">
            <input type="hidden" name="op" value="product-cost" />
            <p className="text-sm font-bold">Change supplier cost</p>
            <div className="flex gap-2">
              <input
                name="productRef"
                placeholder="e.g. AMAZONPAY-1000"
                className={inputClasses}
              />
              <input
                name="costBps"
                type="number"
                placeholder="bps below face"
                className={`${inputClasses} w-36`}
              />
              <button className={smallButton}>Apply</button>
            </div>
          </form>
          <form action={labCatalogueAction} className="space-y-2">
            <p className="text-sm font-bold">Brand availability / terms</p>
            <div className="flex flex-wrap gap-2">
              <select name="brandRef" className={`${inputClasses} w-44`}>
                {brands.map((b) => (
                  <option key={b.brandRef} value={b.brandRef}>
                    {b.name} ({b.status})
                  </option>
                ))}
              </select>
              <select name="status" className={`${inputClasses} w-36`}>
                <option>OUT_OF_STOCK</option>
                <option>DISABLED</option>
                <option>ACTIVE</option>
              </select>
              <button name="op" value="brand-status" className={smallButton}>
                Set status
              </button>
              <button name="op" value="brand-terms" className={smallButton}>
                Append a terms change
              </button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
