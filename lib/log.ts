/*
 * Structured, sanitised logging. One JSON line per event so any log drain
 * (Vercel, Datadog, Axiom…) can index it. Swap `emit` to ship elsewhere.
 *
 * NEVER log: voucher codes/PINs, passwords, session/reset tokens, secrets,
 * email bodies. `sanitize` strips well-known secret-bearing keys as a
 * safety net, but callers should simply not pass them.
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  requestId?: string;
  orderId?: string;
  paymentId?: string;
  fulfilmentAttemptId?: string;
  providerReference?: string;
  status?: string;
  [key: string]: unknown;
}

const SECRET_KEY =
  /(code|pin|password|secret|token|authorization|cookie|signature|plaintext|body|html|text)$/i;
const ALLOWED_KEYS = new Set([
  "statusCode",
  "errorCode",
  "eventType",
  "providerVoucherRefs",
]);

/** Recursively drops secret-looking keys and truncates long strings. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string")
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error)
    return { name: value.name, message: value.message };
  if (Array.isArray(value))
    return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] =
      SECRET_KEY.test(key) && !ALLOWED_KEYS.has(key)
        ? "[redacted]"
        : sanitize(v, depth + 1);
  }
  return out;
}

function emit(level: Level, event: string, fields: LogFields) {
  if (process.env.LOG_LEVEL === "silent") return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(sanitize(fields) as object),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields: LogFields = {}) => {
    if (process.env.LOG_LEVEL === "debug") emit("debug", event, fields);
  },
  info: (event: string, fields: LogFields = {}) => emit("info", event, fields),
  warn: (event: string, fields: LogFields = {}) => emit("warn", event, fields),
  error: (event: string, fields: LogFields = {}) =>
    emit("error", event, fields),
};
