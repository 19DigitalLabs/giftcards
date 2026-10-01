import {
  adminSetBrandDiscountAction,
  adminSetBrandDisabledAction,
  adminSetProductDisabledAction,
  adminSyncCatalogueAction,
} from "@/lib/actions/admin";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateMargin, formatBps, formatINR } from "@/lib/money";
import { AdminMessage, smallButton, Table, td } from "@/components/admin-ui";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminCatalogue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "ADMIN";
  const { msg } = await searchParams;
  const brands = await db.brand.findMany({
    include: {
      products: { orderBy: { faceValuePaise: "asc" } },
      provider: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <AdminMessage msg={msg} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-extrabold">Catalogue</h1>
        {isAdmin && (
          <form action={adminSyncCatalogueAction}>
            <SubmitButton pendingLabel="Syncing…">
              Sync catalogue from provider
            </SubmitButton>
          </form>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Provider cost and margin are internal — customers only ever see value,
        price and discount. Demo economics are simulated.
      </p>
      <div className="mt-6 space-y-4">
        {brands.map((b) => (
          <Card key={b.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-extrabold">
                  {b.name}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {b.provider?.code}/{b.providerBrandRef}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Status <b>{b.status}</b> (provider {b.providerStatus}
                  {b.adminDisabled ? ", admin-disabled" : ""}) · terms:{" "}
                  {b.termsSource} · discount {formatBps(b.discountBps)} · synced{" "}
                  {b.lastSyncedAt?.toLocaleString("en-IN") ?? "never"}
                </p>
              </div>
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2">
                  <form
                    action={adminSetBrandDiscountAction.bind(null, b.id)}
                    className="flex items-center gap-1"
                  >
                    <input
                      name="discountBps"
                      type="number"
                      min={0}
                      max={2000}
                      defaultValue={b.discountBps}
                      className="h-8 w-20 rounded-full border border-border bg-background px-3 text-xs"
                      aria-label="Discount bps"
                    />
                    <button className={smallButton}>Set bps</button>
                  </form>
                  <form
                    action={adminSetBrandDisabledAction.bind(
                      null,
                      b.id,
                      !b.adminDisabled,
                    )}
                  >
                    <button className={smallButton}>
                      {b.adminDisabled ? "Enable brand" : "Disable brand"}
                    </button>
                  </form>
                </div>
              )}
            </div>
            <div className="mt-3">
              <Table
                head={[
                  "SKU",
                  "Face",
                  "Cost",
                  "Selling",
                  "Discount",
                  "Margin",
                  "Status",
                  "",
                ]}
              >
                {b.products.map((p) => (
                  <tr key={p.id}>
                    <td className={`${td} font-mono text-xs`}>{p.sku}</td>
                    <td className={td}>
                      {p.faceValuePaise != null
                        ? formatINR(p.faceValuePaise)
                        : "range"}
                    </td>
                    <td className={td}>
                      {p.costPricePaise != null
                        ? formatINR(p.costPricePaise)
                        : "—"}
                    </td>
                    <td className={td}>
                      {p.sellingPricePaise != null
                        ? formatINR(p.sellingPricePaise)
                        : "—"}
                    </td>
                    <td className={td}>
                      {p.faceValuePaise != null && p.sellingPricePaise != null
                        ? formatINR(p.faceValuePaise - p.sellingPricePaise)
                        : "—"}
                    </td>
                    <td className={td}>
                      {p.sellingPricePaise != null && p.costPricePaise != null
                        ? formatINR(
                            calculateMargin(
                              p.sellingPricePaise,
                              p.costPricePaise,
                            ),
                          )
                        : "—"}
                    </td>
                    <td className={`${td} font-mono text-xs`}>
                      {p.status}
                      {p.adminDisabled ? " (admin)" : ""}
                    </td>
                    <td className={td}>
                      {isAdmin && (
                        <form
                          action={adminSetProductDisabledAction.bind(
                            null,
                            p.id,
                            !p.adminDisabled,
                          )}
                        >
                          <button className={smallButton}>
                            {p.adminDisabled ? "Enable" : "Disable"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
