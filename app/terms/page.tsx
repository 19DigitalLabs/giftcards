import type { Metadata } from "next";
import Link from "next/link";
import { company } from "@/lib/company";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms & conditions" };

export default function TermsPage() {
  return (
    <LegalPage legal title="Terms & conditions">
      <p>
        These terms govern your use of Gifts19, operated by {company.legalName}{" "}
        (&quot;we&quot;, &quot;us&quot;).
      </p>
      <h2>1. What we sell</h2>
      <p>
        Gifts19 sells digital gift cards issued by third-party brands/issuers.
        We intend to source them through authorised distribution partners. We
        are not the issuer of any gift card; each card is subject to its
        issuer&apos;s own terms, shown on the brand page.
      </p>
      <h2>2. Accounts</h2>
      <p>
        You need an account with a verified email address to buy. Keep your
        credentials confidential; you are responsible for activity on your
        account.
      </p>
      <h2>3. Prices and payment</h2>
      <p>
        Prices are shown in Indian Rupees and include any discount. Payments are
        processed by our payment partner. An order is confirmed only after our
        payment partner verifies the payment.
      </p>
      <h2>4. Delivery</h2>
      <p>
        Gift cards are delivered to your Gifts19 account, usually within minutes
        of payment. Occasionally our supplier may take longer; we&apos;ll keep
        you informed.
      </p>
      <h2>5. Use of gift cards</h2>
      <p>
        Gift cards can&apos;t be exchanged for cash. Expiry, redemption rules
        and restrictions are set by the issuer. Treat codes like cash — anyone
        with a code may be able to use it.
      </p>
      <h2>6. Cancellations and refunds</h2>
      <p>
        See our{" "}
        <Link href="/refund-policy" className="text-primary underline">
          refund policy
        </Link>
        .
      </p>
      <h2>7. Limits and fraud prevention</h2>
      <p>
        We may limit order values, decline or hold orders, or suspend accounts
        to prevent fraud or comply with law.
      </p>
      <h2>8. Liability</h2>
      <p>
        [PLACEHOLDER — limitation of liability to be drafted with legal
        counsel.]
      </p>
      <h2>9. Governing law</h2>
      <p>
        [PLACEHOLDER — governing law and jurisdiction to be confirmed with legal
        counsel.]
      </p>
    </LegalPage>
  );
}
