import type { Metadata } from "next";
import { company } from "@/lib/company";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Refund & cancellation policy" };

export default function RefundPolicyPage() {
  return (
    <LegalPage legal title="Refund & cancellation policy">
      <h2>If we can&apos;t deliver your gift card</h2>
      <p>
        If your payment succeeds but we can&apos;t issue your gift card, we
        refund the full amount to your original payment method. Banks usually
        take 5–7 working days to show it.
      </p>
      <h2>Duplicate payments</h2>
      <p>
        If you&apos;re charged more than once for the same order, the extra
        payment is refunded automatically.
      </p>
      <h2>After your gift card is issued</h2>
      <p>
        Because a delivered gift card code works like cash, issued gift cards
        generally can&apos;t be cancelled or refunded, except where the issuer
        allows it or the law requires it. If a code doesn&apos;t work, contact
        us and we&apos;ll raise it with our supplier.
      </p>
      <h2>Failed payments</h2>
      <p>
        If a payment fails but money left your account, your bank or our payment
        partner reverses it automatically.
      </p>
      <h2>Contact</h2>
      <p>Email {company.supportEmail} with your order ID.</p>
    </LegalPage>
  );
}
