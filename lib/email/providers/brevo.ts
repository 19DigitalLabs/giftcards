import { ConfigError } from "../../config";
import type { EmailProvider } from "../types";

/*
 * Brevo (formerly Sendinblue) transactional email over its HTTP API — no
 * SDK. Works without owning a domain: verify a single sender address in
 * Brevo (Senders, domains & dedicated IPs → Senders) and use it as
 * EMAIL_FROM. Without a domain, mail may land in spam; add the domain's DNS
 * records in Brevo once you have one.
 *
 *   EMAIL_PROVIDER=brevo  BREVO_API_KEY=…  EMAIL_FROM=you@gmail.com  EMAIL_FROM_NAME=Gifts19
 */

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export function brevoConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey)
    throw new ConfigError(
      "BREVO_API_KEY is required when EMAIL_PROVIDER=brevo.",
    );
  if (!from)
    throw new ConfigError(
      "EMAIL_FROM (a Brevo-verified sender) is required when EMAIL_PROVIDER=brevo.",
    );
  return {
    apiKey,
    from,
    fromName: process.env.EMAIL_FROM_NAME?.trim() || "Gifts19",
  };
}

export const brevoEmailProvider: EmailProvider = {
  code: "brevo",
  isDemo: false,
  async send(message) {
    const { apiKey, from, fromName } = brevoConfig();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: from, name: fromName },
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        tags: [message.template],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Status + Brevo's error code only — never the message body.
      const detail = await res.json().catch(() => ({}));
      throw new Error(
        `Brevo send failed: HTTP ${res.status} ${(detail as { code?: string }).code ?? ""}`.trim(),
      );
    }
  },
};
