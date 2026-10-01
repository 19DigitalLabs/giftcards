/** Joins class names, skipping falsy values. */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * The canonical site origin, without a trailing slash.
 * Configured per deployment via NEXT_PUBLIC_SITE_URL; falls back to localhost.
 */
export function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
  return url.replace(/\/+$/, "");
}

/** Formats an ISO date string for display, e.g. "July 10, 2026". */
export function formatDate(isoDate: string, locale = "en-US"): string {
  return new Date(isoDate).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Formats a number as Indian Rupee currency, e.g. "₹5,000". */
export function formatRupee(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
