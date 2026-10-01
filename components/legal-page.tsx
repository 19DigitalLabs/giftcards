import type { ReactNode } from "react";
import { company } from "@/lib/company";
import { isDemoMode } from "@/lib/config";
import { Notice, Section } from "@/components/ui";

/** Shared shell for trust/legal pages. Content is a DRAFT until reviewed. */
export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Section containerClassName="max-w-3xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        {title}
      </h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Last updated {company.lastUpdated}
      </p>
      <Notice variant="info" className="mt-5 text-xs">
        Draft for business review — not final legal text.
        {isDemoMode() &&
          " Gift cards and payments on this environment are simulated."}
      </Notice>
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
