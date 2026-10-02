import type { Metadata } from "next";
import { company } from "@/lib/company";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage legal title="Privacy policy">
      <h2>What we collect</h2>
      <ul>
        <li>
          Account details: name, email address, and a one-way hash of your
          password (never the password itself).
        </li>
        <li>
          Order details: what you bought, amounts and payment status. Card/UPI
          details are handled by our payment partner and not stored by us.
        </li>
        <li>Gift card codes issued to you, stored encrypted.</li>
        <li>
          Security data: sign-in sessions and limited technical information used
          to prevent abuse.
        </li>
      </ul>
      <h2>How we use it</h2>
      <p>
        To provide your account and orders, deliver gift cards, process refunds,
        prevent fraud, meet legal obligations and provide support.
      </p>
      <h2>Sharing</h2>
      <p>
        We share only what&apos;s needed with our payment partner, gift card
        supplier and service providers (for example email delivery), and with
        authorities where required by law.
      </p>
      <h2>Retention and your choices</h2>
      <p>
        [PLACEHOLDER — retention periods and data-subject rights process to be
        finalised with legal counsel.]
      </p>
      <h2>Contact</h2>
      <p>
        Privacy questions: {company.supportEmail}. Grievance officer:{" "}
        {company.grievanceOfficer}, {company.grievanceEmail}.
      </p>
    </LegalPage>
  );
}
