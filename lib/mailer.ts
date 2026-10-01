export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends a transactional email. No provider is wired up yet, so it logs to
 * the server console — swap this body for Resend/SES/Postmark when ready.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  console.info(
    `[email] to=${message.to} subject="${message.subject}"\n${message.text}\n[/email]`,
  );
}
