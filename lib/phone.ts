/*
 * Phone numbers are stored as E.164 digits without "+", e.g. 919876543210 —
 * the format WhatsApp Cloud API expects. A bare 10-digit Indian mobile
 * (starting 6–9) gets the 91 country code.
 */

export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!hasPlus && /^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (!hasPlus && /^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  if (/^[1-9]\d{7,14}$/.test(digits) && (hasPlus || digits.startsWith("91"))) {
    if (digits.startsWith("91") && digits.length !== 12) return null;
    return digits;
  }
  return null;
}

/** "+91 98765 43210" for display. */
export function formatPhone(e164: string): string {
  if (e164.startsWith("91") && e164.length === 12)
    return `+91 ${e164.slice(2, 7)} ${e164.slice(7)}`;
  return `+${e164}`;
}

/** "•••• 3210" for logs (never the full number). */
export function maskPhone(e164: string): string {
  return `••••${e164.slice(-4)}`;
}
