import type { Metadata } from "next";
import { CompanyDetails, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <LegalPage title="About Gifts19">
      <p>
        Gifts19 is a marketplace for digital gift cards from popular Indian
        brands across shopping, food, travel and entertainment. We focus on
        clear pricing, secure checkout and fast delivery of your gift card to
        your account.
      </p>
      <p>
        Gifts19 intends to source digital gift cards through authorised
        distribution partners. Gift cards are issued by their respective brands
        or issuers; Gifts19 is not the issuer, and brand names and logos belong
        to their owners and do not imply endorsement.
      </p>
      <h2>Company details</h2>
      <CompanyDetails />
    </LegalPage>
  );
}
