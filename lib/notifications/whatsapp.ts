import { ConfigError, siteUrl } from "../config";
import type { EmailTemplate, TemplateData } from "../email/templates";
import { formatINR } from "../money";

/*
 * WhatsApp notifications via Meta's WhatsApp Cloud API (graph.facebook.com),
 * no SDK. Two modes:
 *
 *   template  business-initiated messages using templates you created and
 *             Meta approved in WhatsApp Manager (the proper way)
 *   text      free-form text — only delivered to people who messaged your
 *             WhatsApp number in the last 24h (handy for family testing)
 *
 * Messages never contain gift card codes; they link to the account.
 *
 *   WHATSAPP_PROVIDER=meta  WHATSAPP_ACCESS_TOKEN=…  WHATSAPP_PHONE_NUMBER_ID=…
 *   WHATSAPP_MESSAGE_MODE=template|text   (default template)
 */

export type WhatsAppEvent = Extract<
  EmailTemplate,
  | "PAYMENT_RECEIVED"
  | "GIFT_CARD_READY"
  | "FULFILMENT_DELAYED"
  | "REFUND_INITIATED"
  | "REFUND_COMPLETED"
  | "SUPPORT_REPLY"
>;

export const WHATSAPP_EVENTS: readonly WhatsAppEvent[] = [
  "PAYMENT_RECEIVED",
  "GIFT_CARD_READY",
  "FULFILMENT_DELAYED",
  "REFUND_INITIATED",
  "REFUND_COMPLETED",
  "SUPPORT_REPLY",
];

export function isWhatsAppEvent(t: EmailTemplate): t is WhatsAppEvent {
  return (WHATSAPP_EVENTS as readonly string[]).includes(t);
}

/**
 * Template name + body text per event. The body is what you paste into
 * WhatsApp Manager when creating each template (Category: Utility,
 * Language: English); {{n}} are filled from `params` in order.
 */
export const WHATSAPP_TEMPLATES: Record<
  WhatsAppEvent,
  {
    name: string;
    body: string;
    params: (d: TemplateData, base: string) => string[];
  }
> = {
  PAYMENT_RECEIVED: {
    name: "gifts19_payment_received",
    body: "Hi {{1}}, we've received your payment of {{2}} for Gifts19 order {{3}}. We're preparing your gift card now. Track it here: {{4}}",
    params: (d, base) => [
      first(d.name),
      formatINR(d.amountPaise ?? 0),
      d.orderId ?? "",
      `${base}/orders/${d.orderId}`,
    ],
  },
  GIFT_CARD_READY: {
    name: "gifts19_gift_card_ready",
    body: "Hi {{1}}, your Gifts19 gift card for order {{2}} is ready. For your security we never send codes on WhatsApp — sign in to view it: {{3}}",
    params: (d, base) => [
      first(d.name),
      d.orderId ?? "",
      `${base}/orders/${d.orderId}`,
    ],
  },
  FULFILMENT_DELAYED: {
    name: "gifts19_order_delayed",
    body: "Hi {{1}}, your Gifts19 order {{2}} is taking a little longer than usual. Your payment is safe and there's nothing you need to do. Status: {{3}}",
    params: (d, base) => [
      first(d.name),
      d.orderId ?? "",
      `${base}/orders/${d.orderId}`,
    ],
  },
  REFUND_INITIATED: {
    name: "gifts19_refund_started",
    body: "Hi {{1}}, we couldn't complete Gifts19 order {{2}}, so we've started a refund of {{3}} to your original payment method. Banks usually take 5–7 working days.",
    params: (d) => [
      first(d.name),
      d.orderId ?? "",
      formatINR(d.amountPaise ?? 0),
    ],
  },
  REFUND_COMPLETED: {
    name: "gifts19_refund_completed",
    body: "Hi {{1}}, your refund of {{2}} for Gifts19 order {{3}} has been processed by our payment partner.",
    params: (d) => [
      first(d.name),
      formatINR(d.amountPaise ?? 0),
      d.orderId ?? "",
    ],
  },
  SUPPORT_REPLY: {
    name: "gifts19_support_reply",
    body: "Hi {{1}}, our support team replied to your Gifts19 ticket {{2}}. Read it here: {{3}}",
    params: (d, base) => [
      first(d.name),
      d.ticketId ?? "",
      `${base}/account/support/${d.ticketId}`,
    ],
  },
};

function first(name?: string) {
  return name?.trim().split(/\s+/)[0] || "there";
}

/** The filled-in body (used for text mode and previews). */
export function renderWhatsAppText(
  event: WhatsAppEvent,
  data: TemplateData,
): string {
  const t = WHATSAPP_TEMPLATES[event];
  const values = t.params(data, siteUrl());
  return t.body.replace(
    /\{\{(\d+)\}\}/g,
    (_, n: string) => values[Number(n) - 1] ?? "",
  );
}

export function whatsappConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token)
    throw new ConfigError(
      "WHATSAPP_ACCESS_TOKEN is required when WHATSAPP_PROVIDER=meta.",
    );
  if (!phoneNumberId)
    throw new ConfigError(
      "WHATSAPP_PHONE_NUMBER_ID is required when WHATSAPP_PROVIDER=meta.",
    );
  return {
    token,
    phoneNumberId,
    apiVersion: process.env.WHATSAPP_API_VERSION?.trim() || "v23.0",
    mode:
      process.env.WHATSAPP_MESSAGE_MODE?.trim() === "text"
        ? ("text" as const)
        : ("template" as const),
    language: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en",
  };
}

/** Sends one WhatsApp message. Throws on failure (status + Meta error code only). */
export async function sendWhatsApp(
  toE164: string,
  event: WhatsAppEvent,
  data: TemplateData,
): Promise<void> {
  const cfg = whatsappConfig();
  const t = WHATSAPP_TEMPLATES[event];
  const payload =
    cfg.mode === "template"
      ? {
          messaging_product: "whatsapp",
          to: toE164,
          type: "template",
          template: {
            name: t.name,
            language: { code: cfg.language },
            components: [
              {
                type: "body",
                parameters: t
                  .params(data, siteUrl())
                  .map((text) => ({ type: "text", text })),
              },
            ],
          },
        }
      : {
          messaging_product: "whatsapp",
          to: toE164,
          type: "text",
          text: { body: renderWhatsAppText(event, data), preview_url: true },
        };

  const res = await fetch(
    `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as {
      error?: { code?: number; error_subcode?: number };
    };
    throw new Error(
      `WhatsApp send failed: HTTP ${res.status} code ${detail.error?.code ?? "?"}${detail.error?.error_subcode ? `/${detail.error.error_subcode}` : ""}`,
    );
  }
}
