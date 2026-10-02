/*
 * Email provider contract. The demo provider stores messages in an outbox
 * table; a real one (Resend, SES, Postmark…) implements the same interface
 * and is registered in lib/email/service.ts.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. May contain one-time links — never log it. */
  text: string;
  /** Branded HTML version (lib/email/layout.ts). */
  html?: string;
  /** Template id, for metadata/logging. */
  template: string;
}

export interface EmailProvider {
  readonly code: string;
  readonly isDemo: boolean;
  send(message: EmailMessage): Promise<void>;
}
