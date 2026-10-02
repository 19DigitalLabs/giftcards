import { appMode, ConfigError, emailProviderCode } from "../config";
import { db } from "../db";
import { log } from "../log";
import { brevoEmailProvider } from "./providers/brevo";
import {
  renderEmail,
  type EmailTemplate,
  type TemplateData,
} from "./templates";
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
        html: message.html ?? null,
      },
    });
  },
};

const PROVIDERS: Record<string, EmailProvider> = {
  demo: demoEmailProvider,
  brevo: brevoEmailProvider,
  // resend: resendEmailProvider,  ← further providers plug in here
};

export function activeEmailProvider(): EmailProvider {
  const provider = PROVIDERS[emailProviderCode()];
  if (!provider)
    throw new ConfigError(`Unknown EMAIL_PROVIDER "${emailProviderCode()}".`);
  if (provider.isDemo && appMode() === "live") {
    throw new ConfigError("The demo email provider is disabled in live mode.");
  }
  // Demo mode with a real provider: also keep a copy in the demo inbox, so
  // testers can still open links if the real email lands in spam.
  if (!provider.isDemo && appMode() === "demo") {
    return {
      code: provider.code,
      isDemo: false,
      async send(message) {
        await demoEmailProvider.send(message);
        await provider.send(message);
      },
    };
  }
  return provider;
}

export type { EmailTemplate, TemplateData } from "./templates";

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
  const { subject, text, html } = renderEmail(template, data);
  const message: EmailMessage = { to, subject, text, html, template };
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
