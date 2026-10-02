import type { ReactNode } from "react";
import { company } from "@/lib/company";
import { isDemoMode } from "@/lib/config";
import { Notice, Section } from "@/components/ui";

/**
 * Shared shell for trust pages. `legal` pages (terms, privacy, refunds) show
 * a "last updated" date and are marked as DRAFT until legally reviewed.
 */
export function LegalPage({
  title,
  legal = false,
  children,
}: {
  title: string;
  legal?: boolean;
  children: ReactNode;
}) {
  const demo = isDemoMode();
  return (
    <Section containerClassName="max-w-3xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        {title}
      </h1>
      {legal && (
        <p className="mt-2 text-xs text-muted-foreground">
          Last updated {company.lastUpdated}
        </p>
      )}
      {(legal || demo) && (
        <Notice variant="info" className="mt-5 text-xs">
          {legal && "Draft for business review — not final legal text. "}
          {demo && "Gift cards and payments on this environment are simulated."}
        </Notice>
      )}
      <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">
        {children}
      </div>
    </Section>
  );
}

export function CompanyDetails() {
  return (
    <ul>
      <li>Legal entity: {company.legalName}</li>
      <li>Registered address: {company.registeredAddress}</li>
      <li>GSTIN: {company.gstin}</li>
      <li>CIN: {company.cin}</li>
      <li>
        Support: {company.supportEmail} ({company.supportHours})
      </li>
    </ul>
  );
}
