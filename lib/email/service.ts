import { appMode, ConfigError, emailProviderCode, siteUrl } from "../config";
import { db } from "../db";
import { log } from "../log";
import { formatINR } from "../money";
import type { EmailMessage, EmailProvider } from "./types";

/* ─── Providers ─────────────────────────────────────────────────────────── */

/** Demo: writes to the DemoEmail outbox, readable at /demo/emails. */
const demoEmailProvider: EmailProvider = {
  code: "demo",
  isDemo: true,
  async send(message) {
    await db.demoEmail.create({
      data: {
        to: message.to,
        subject: message.subject,
        template: message.template,
        text: message.text,
      },
    });
  },
};

const PROVIDERS: Record<string, EmailProvider> = {
  demo: demoEmailProvider,
  // resend: resendEmailProvider,  ← a real provider plugs in here
};

export function activeEmailProvider(): EmailProvider {
  const provider = PROVIDERS[emailProviderCode()];
  if (!provider)
    throw new ConfigError(`Unknown EMAIL_PROVIDER "${emailProviderCode()}".`);
  if (provider.isDemo && appMode() === "live") {
    throw new ConfigError("The demo email provider is disabled in live mode.");
  }
  return provider;
}

/* ─── Templates ─────────────────────────────────────────────────────────── */

export type EmailTemplate =
  | "WELCOME_VERIFY"
  | "VERIFY_EMAIL"
  | "PASSWORD_RESET"
  | "PAYMENT_RECEIVED"
  | "GIFT_CARD_READY"
  | "FULFILMENT_DELAYED"
  | "REFUND_INITIATED"
  | "REFUND_COMPLETED"
  | "SUPPORT_TICKET_CREATED"
  | "SUPPORT_REPLY";

interface TemplateData {
  name?: string;
  link?: string;
  orderId?: string;
  amountPaise?: number;
  ticketId?: string;
}

function render(
  template: EmailTemplate,
  d: TemplateData,
): { subject: string; text: string } {
  const hi = `Hi ${d.name ?? "there"},`;
  const orderLink = d.orderId ? `${siteUrl()}/orders/${d.orderId}` : siteUrl();
  const sign = "\n\n— Team Gifts19";
  switch (template) {
    case "WELCOME_VERIFY":
      return {
        subject: "Welcome to Gifts19 — please verify your email",
        text: `${hi}\n\nThanks for creating a Gifts19 account. Please confirm your email address to start buying gift cards:\n\n${d.link}\n\nThis link expires in 24 hours.${sign}`,
      };
    case "VERIFY_EMAIL":
      return {
        subject: "Verify your email address",
        text: `${hi}\n\nConfirm your email address with this link (valid for 24 hours):\n\n${d.link}${sign}`,
      };
    case "PASSWORD_RESET":
      return {
        subject: "Reset your Gifts19 password",
        text: `${hi}\n\nUse this link to set a new password (valid for 30 minutes):\n\n${d.link}\n\nIf you didn't ask for this, you can ignore this email — your password won't change.${sign}`,
      };
    case "PAYMENT_RECEIVED":
      return {
        subject: `Payment received for order ${d.orderId}`,
        text: `${hi}\n\nWe've received your payment of ${formatINR(d.amountPaise ?? 0)} for order ${d.orderId}. We're preparing your gift card now.\n\nTrack it here: ${orderLink}${sign}`,
      };
    case "GIFT_CARD_READY":
      return {
        subject: `Your gift card is ready (order ${d.orderId})`,
        // Deliberately no voucher code in email: it's revealed in the account.
        text: `${hi}\n\nYour gift card is ready. Sign in to Gifts19 to view it:\n\n${orderLink}${sign}`,
      };
    case "FULFILMENT_DELAYED":
      return {
        subject: `Your order ${d.orderId} is taking a little longer`,
        text: `${hi}\n\nYour payment is safe. We're still confirming your gift card with our supplier and will email you as soon as it's ready. No action is needed from you.\n\n${orderLink}${sign}`,
      };
    case "REFUND_INITIATED":
      return {
        subject: `Refund started for order ${d.orderId}`,
        text: `${hi}\n\nWe couldn't complete your gift card order, so we've started a refund of ${formatINR(d.amountPaise ?? 0)} to your original payment method. Banks usually take 5–7 working days to show it.\n\n${orderLink}${sign}`,
      };
    case "REFUND_COMPLETED":
      return {
        subject: `Refund completed for order ${d.orderId}`,
        text: `${hi}\n\nYour refund of ${formatINR(d.amountPaise ?? 0)} for order ${d.orderId} has been processed by our payment partner.${sign}`,
      };
    case "SUPPORT_TICKET_CREATED":
      return {
        subject: `We've received your request (${d.ticketId})`,
        text: `${hi}\n\nThanks for contacting Gifts19 support. Your ticket ${d.ticketId} is open and we'll reply soon.\n\nView it here: ${siteUrl()}/account/support/${d.ticketId}${sign}`,
      };
    case "SUPPORT_REPLY":
      return {
        subject: `New reply on your support ticket ${d.ticketId}`,
        // No message body in email: replies are read in the account.
        text: `${hi}\n\nOur support team replied to your ticket ${d.ticketId}. Sign in to read it:\n\n${siteUrl()}/account/support/${d.ticketId}${sign}`,
      };
  }
}

/**
 * Renders and sends a transactional email. Best-effort: a failed email is
 * logged, never thrown — it must not roll back a payment or fulfilment.
 * Logs carry metadata only, never the body (it may contain one-time links).
 */
export async function sendTemplateEmail(
  template: EmailTemplate,
  to: string,
  data: TemplateData,
): Promise<boolean> {
  const { subject, text } = render(template, data);
  const message: EmailMessage = { to, subject, text, template };
  try {
    await activeEmailProvider().send(message);
    log.info("email.sent", { event: template, toDomain: to.split("@")[1] });
    return true;
  } catch (error) {
    log.error("email.failed", {
      event: template,
      toDomain: to.split("@")[1],
      error,
    });
    return false;
  }
}
