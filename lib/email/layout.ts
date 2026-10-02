import { company } from "../company";
import { isDemoMode, siteUrl } from "../config";

/*
 * Branded HTML email shell — the website's look, built for email clients:
 * table layout, inline styles, no scripts, web fonts with safe fallbacks
 * (Gmail ignores web fonts; Apple Mail/iOS use them). Colours mirror the
 * site's theme tokens in app/globals.css.
 */

const C = {
  ground: "#0a0614",
  card: "#151024",
  raised: "#1d1631",
  border: "#2b2442",
  text: "#f4f1ff",
  body: "#cbc3e6",
  muted: "#a89ec6",
  lime: "#d8ff3e",
  limeText: "#141604",
  violet: "#8b5cf6",
  pink: "#ff5fd2",
};

const FONT_BODY = "'Space Grotesk','Segoe UI',Helvetica,Arial,sans-serif";
const FONT_DISPLAY =
  "'Bricolage Grotesque','Space Grotesk','Segoe UI',Helvetica,Arial,sans-serif";

/** Escapes user-controlled text (e.g. a customer's name) for HTML. */
export function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

export interface EmailContent {
  /** Inbox preview line (hidden in the body). */
  preheader: string;
  heading: string;
  /** Greeting name; escaped. */
  name?: string;
  paragraphs: string[];
  /** Label/value rows shown in a highlighted box (e.g. order, amount). */
  summary?: { label: string; value: string }[];
  button?: { label: string; url: string };
  /** Small print under the button. */
  note?: string;
}

function button(label: string, url: string) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
    <tr><td bgcolor="${C.lime}" style="border-radius:999px;">
      <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FONT_BODY};font-size:15px;font-weight:700;color:${C.limeText};text-decoration:none;border-radius:999px;">${esc(label)} &rarr;</a>
    </td></tr>
  </table>`;
}

function summaryBox(rows: { label: string; value: string }[]) {
  const cells = rows
    .map(
      (r, i) => `
      <tr>
        <td style="padding:10px 18px;${i ? `border-top:1px solid ${C.border};` : ""}font-family:${FONT_BODY};font-size:13px;color:${C.muted};">${esc(r.label)}</td>
        <td align="right" style="padding:10px 18px;${i ? `border-top:1px solid ${C.border};` : ""}font-family:${FONT_BODY};font-size:14px;font-weight:700;color:${C.text};">${esc(r.value)}</td>
      </tr>`,
    )
    .join("");
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;background:${C.raised};border-radius:16px;">
    ${cells}
  </table>`;
}

export function renderHtml(content: EmailContent, subject: string): string {
  const base = siteUrl();
  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:${FONT_BODY};font-size:15px;line-height:24px;color:${C.body};">${esc(p)}</p>`,
    )
    .join("");
  const demo = isDemoMode()
    ? `<p style="margin:0 0 8px;font-family:${FONT_BODY};font-size:12px;line-height:18px;color:#ff9d3c;">Demo environment — payments and gift cards are simulated.</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;background:${C.ground};}
  a{color:${C.lime};}
  @media (max-width:620px){ .container{width:100% !important;} .pad{padding:28px 22px !important;} }
</style>
</head>
<body style="margin:0;padding:0;background:${C.ground};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(content.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ground}" style="background:${C.ground};">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

      <!-- Logo -->
      <tr><td style="padding:0 8px 22px;">
        <a href="${esc(base)}" target="_blank" style="text-decoration:none;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="36" height="36" align="center" valign="middle" bgcolor="${C.violet}" style="width:36px;height:36px;border-radius:11px;background:${C.violet};background-image:linear-gradient(135deg,${C.violet},${C.pink},#ff9d3c);font-size:18px;line-height:36px;">&#127873;</td>
            <td style="padding-left:10px;font-family:${FONT_DISPLAY};font-size:22px;font-weight:800;color:${C.text};letter-spacing:-0.3px;">Gifts<span style="color:${C.lime};">19</span></td>
          </tr></table>
        </a>
      </td></tr>

      <!-- Card -->
      <tr><td class="pad" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.border};border-radius:28px;padding:40px 40px 34px;">
        <h1 style="margin:0 0 18px;font-family:${FONT_DISPLAY};font-size:28px;line-height:34px;font-weight:800;color:${C.text};letter-spacing:-0.5px;">${esc(content.heading)}</h1>
        <p style="margin:0 0 14px;font-family:${FONT_BODY};font-size:15px;line-height:24px;color:${C.body};">Hi ${esc(content.name?.trim() || "there")},</p>
        ${paragraphs}
        ${content.summary?.length ? summaryBox(content.summary) : ""}
        ${content.button ? button(content.button.label, content.button.url) : ""}
        ${content.note ? `<p style="margin:16px 0 0;font-family:${FONT_BODY};font-size:13px;line-height:20px;color:${C.muted};">${esc(content.note)}</p>` : ""}
        ${
          content.button
            ? `<p style="margin:22px 0 0;font-family:${FONT_BODY};font-size:12px;line-height:18px;color:${C.muted};">Button not working? Paste this link into your browser:<br><a href="${esc(content.button.url)}" style="color:${C.lime};word-break:break-all;">${esc(content.button.url)}</a></p>`
            : ""
        }
        <p style="margin:26px 0 0;font-family:${FONT_BODY};font-size:15px;line-height:24px;color:${C.body};">— Team Gifts19</p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:24px 12px 0;text-align:center;">
        ${demo}
        <p style="margin:0 0 8px;font-family:${FONT_BODY};font-size:12px;line-height:18px;color:${C.muted};">
          Questions? <a href="${esc(base)}/account/support" style="color:${C.lime};text-decoration:none;">Contact support</a> or write to ${esc(company.supportEmail)}
        </p>
        <p style="margin:0;font-family:${FONT_BODY};font-size:11px;line-height:17px;color:#6f6790;">
          Gift cards are issued by their respective brands. Gifts19 will never ask for your password or email you a gift card code.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Plain-text twin of the same content (for clients without HTML). */
export function renderText(content: EmailContent): string {
  const lines = [
    `Hi ${content.name?.trim() || "there"},`,
    "",
    ...content.paragraphs.flatMap((p) => [p, ""]),
  ];
  if (content.summary?.length) {
    lines.push(...content.summary.map((r) => `${r.label}: ${r.value}`), "");
  }
  if (content.button)
    lines.push(`${content.button.label}: ${content.button.url}`, "");
  if (content.note) lines.push(content.note, "");
  lines.push("— Team Gifts19");
  return lines.join("\n");
}
