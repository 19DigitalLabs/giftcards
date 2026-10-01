/*
 * Company / legal details shown on trust pages and the footer. Every value
 * marked [PLACEHOLDER] must be replaced with the real registered details
 * before launch. Overridable per deployment via env so nothing needs a
 * code change once the entity is set up.
 */

const env = (key: string, fallback: string) =>
  process.env[key]?.trim() || fallback;

export const company = {
  brandName: "Gifts19",
  legalName: env(
    "COMPANY_LEGAL_NAME",
    "[PLACEHOLDER — registered legal entity name]",
  ),
  registeredAddress: env(
    "COMPANY_ADDRESS",
    "[PLACEHOLDER — registered office address]",
  ),
  gstin: env("COMPANY_GSTIN", "[PLACEHOLDER — GSTIN]"),
  cin: env("COMPANY_CIN", "[PLACEHOLDER — CIN, if applicable]"),
  supportEmail: env("SUPPORT_EMAIL", "support@example.com"),
  supportHours: env("SUPPORT_HOURS", "Mon–Sat, 10:00–18:00 IST"),
  grievanceOfficer: env(
    "GRIEVANCE_OFFICER",
    "[PLACEHOLDER — Grievance Officer name]",
  ),
  grievanceEmail: env(
    "GRIEVANCE_EMAIL",
    "[PLACEHOLDER — grievance@yourdomain]",
  ),
  lastUpdated: "1 October 2026",
};

export const isPlaceholder = (value: string) =>
  value.startsWith("[PLACEHOLDER");
