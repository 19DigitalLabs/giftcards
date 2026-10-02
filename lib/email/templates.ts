import { siteUrl } from "../config";
import { formatINR } from "../money";
import { renderHtml, renderText, type EmailContent } from "./layout";

/*
 * Every transactional email, written once as structured content and
 * rendered to both branded HTML and plain text.
 *
 * Rule: no secrets beyond the one-time link the email exists to deliver.
 * Gift card codes and support replies are never put in email — the
 * customer signs in to see them.
 */

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

export interface TemplateData {
  name?: string;
  link?: string;
  orderId?: string;
  amountPaise?: number;
  ticketId?: string;
}

function content(
  template: EmailTemplate,
  d: TemplateData,
): { subject: string; body: EmailContent } {
  const base = siteUrl();
  const orderUrl = d.orderId ? `${base}/orders/${d.orderId}` : `${base}/orders`;
  const ticketUrl = `${base}/account/support/${d.ticketId ?? ""}`;
  const amount = formatINR(d.amountPaise ?? 0);
  const order = d.orderId ? [{ label: "Order", value: d.orderId }] : [];

  switch (template) {
    case "WELCOME_VERIFY":
      return {
        subject: "Welcome to Gifts19 — please verify your email",
        body: {
          preheader: "One quick step before you can buy gift cards.",
          heading: "Welcome to Gifts19",
          name: d.name,
          paragraphs: [
            "Thanks for creating your account. Please confirm your email address so you can start buying gift cards.",
          ],
          button: { label: "Verify my email", url: d.link ?? base },
          note: "This link expires in 24 hours. If you didn't create an account, you can ignore this email.",
        },
      };
    case "VERIFY_EMAIL":
      return {
        subject: "Verify your email address",
        body: {
          preheader: "Confirm your email to start buying gift cards.",
          heading: "Verify your email",
          name: d.name,
          paragraphs: [
            "Confirm your email address to finish setting up your Gifts19 account.",
          ],
          button: { label: "Verify my email", url: d.link ?? base },
          note: "This link expires in 24 hours.",
        },
      };
    case "PASSWORD_RESET":
      return {
        subject: "Reset your Gifts19 password",
        body: {
          preheader: "Use this link to set a new password.",
          heading: "Reset your password",
          name: d.name,
          paragraphs: [
            "We received a request to reset your password. Use the button below to choose a new one.",
          ],
          button: { label: "Set a new password", url: d.link ?? base },
          note: "This link works once and expires in 30 minutes. If you didn't ask for this, ignore this email — your password won't change.",
        },
      };
    case "PAYMENT_RECEIVED":
      return {
        subject: `Payment received for order ${d.orderId}`,
        body: {
          preheader: `We've received ${amount}. Your gift card is on its way.`,
          heading: "Payment received",
          name: d.name,
          paragraphs: [
            "Thanks! We've received your payment and we're preparing your gift card now. It usually takes a few seconds.",
          ],
          summary: [...order, { label: "Amount paid", value: amount }],
          button: { label: "Track your order", url: orderUrl },
        },
      };
    case "GIFT_CARD_READY":
      return {
        subject: `Your gift card is ready 🎉 (order ${d.orderId})`,
        body: {
          preheader: "Sign in to Gifts19 to view your gift card.",
          heading: "Your gift card is ready",
          name: d.name,
          paragraphs: [
            "Good news — your gift card has been issued. Sign in to reveal the code whenever you're ready to use it.",
          ],
          summary: order,
          button: { label: "View my gift card", url: orderUrl },
          note: "For your security, we never send gift card codes by email.",
        },
      };
    case "FULFILMENT_DELAYED":
      return {
        subject: `Your order ${d.orderId} is taking a little longer`,
        body: {
          preheader: "Your payment is safe — we'll email you when it's ready.",
          heading: "Taking a little longer",
          name: d.name,
          paragraphs: [
            "Your payment is safe. We're still confirming your gift card with our supplier and will email you as soon as it's ready.",
            "There's nothing you need to do.",
          ],
          summary: order,
          button: { label: "View order status", url: orderUrl },
        },
      };
    case "REFUND_INITIATED":
      return {
        subject: `Refund started for order ${d.orderId}`,
        body: {
          preheader: `We've started a refund of ${amount}.`,
          heading: "Your refund has started",
          name: d.name,
          paragraphs: [
            "We're sorry — we couldn't complete your gift card order, so we've started a full refund to your original payment method.",
            "Banks usually take 5–7 working days to show it.",
          ],
          summary: [...order, { label: "Refund amount", value: amount }],
          button: { label: "View order", url: orderUrl },
        },
      };
    case "REFUND_COMPLETED":
      return {
        subject: `Refund completed for order ${d.orderId}`,
        body: {
          preheader: `${amount} has been refunded.`,
          heading: "Refund completed",
          name: d.name,
          paragraphs: [
            "Your refund has been processed by our payment partner. Depending on your bank it can take a few days to appear.",
          ],
          summary: [...order, { label: "Refunded", value: amount }],
          button: { label: "View order", url: orderUrl },
        },
      };
    case "SUPPORT_TICKET_CREATED":
      return {
        subject: `We've received your request (${d.ticketId})`,
        body: {
          preheader: "Our support team will reply soon.",
          heading: "We've got your request",
          name: d.name,
          paragraphs: [
            "Thanks for contacting Gifts19 support. Your ticket is open and our team will reply soon — usually within one working day.",
          ],
          summary: [{ label: "Ticket", value: d.ticketId ?? "" }],
          button: { label: "View ticket", url: ticketUrl },
        },
      };
    case "SUPPORT_REPLY":
      return {
        subject: `New reply on your support ticket ${d.ticketId}`,
        body: {
          preheader: "Our support team replied to your ticket.",
          heading: "You have a new reply",
          name: d.name,
          paragraphs: [
            "Our support team replied to your ticket. Sign in to read it and respond.",
          ],
          summary: [{ label: "Ticket", value: d.ticketId ?? "" }],
          button: { label: "Read reply", url: ticketUrl },
        },
      };
  }
}

export function renderEmail(template: EmailTemplate, data: TemplateData) {
  const { subject, body } = content(template, data);
  return { subject, text: renderText(body), html: renderHtml(body, subject) };
}
