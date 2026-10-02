import { whatsappProviderCode } from "../config";
import { sendTemplateEmail } from "../email/service";
import type { EmailTemplate, TemplateData } from "../email/templates";
import { log } from "../log";
import { maskPhone } from "../phone";
import { isWhatsAppEvent, sendWhatsApp } from "./whatsapp";

/*
 * One call per customer notification: email always, plus WhatsApp when the
 * customer added a number AND opted in, and WhatsApp is configured.
 * Best-effort on every channel — never throws, never blocks money flows.
 */

export interface Recipient {
  name: string;
  email: string;
  phone?: string | null;
  whatsappOptIn?: boolean;
}

/** Returns whether the email was sent (callers use it for delivery stamps). */
export async function notifyCustomer(
  template: EmailTemplate,
  to: Recipient,
  data: TemplateData,
): Promise<boolean> {
  const emailed = await sendTemplateEmail(template, to.email, {
    name: to.name,
    ...data,
  });

  if (
    whatsappProviderCode() === "meta" &&
    isWhatsAppEvent(template) &&
    to.phone &&
    to.whatsappOptIn
  ) {
    try {
      await sendWhatsApp(to.phone, template, { name: to.name, ...data });
      log.info("whatsapp.sent", { template, to: maskPhone(to.phone) });
    } catch (error) {
      log.error("whatsapp.failed", {
        template,
        to: maskPhone(to.phone),
        error,
      });
    }
  }
  return emailed;
}
