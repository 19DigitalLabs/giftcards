import type { Metadata } from "next";
import Link from "next/link";
import { company } from "@/lib/company";
import { CompanyDetails, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <LegalPage title="Contact us">
      <p>
        For help with an order, email <strong>{company.supportEmail}</strong> (
        {company.supportHours}) and include your order ID (it starts with{" "}
        <code>GC-</code>). You can also use our{" "}
        <Link href="/support" className="text-primary underline">
          support page
        </Link>
        .
      </p>
      <h2>Grievance officer</h2>
      <p>
        {company.grievanceOfficer} — {company.grievanceEmail}. We aim to
        acknowledge grievances promptly and resolve them within the timelines
        required by applicable law.
      </p>
      <h2>Company details</h2>
      <CompanyDetails />
    </LegalPage>
  );
}
