/*
 * Structured application errors. `publicMessage` is safe to show a customer;
 * `code` and `context` are for logs/admin and must never carry secrets.
 */

export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly publicMessage: string,
    readonly context: Record<string, unknown> = {},
  ) {
    super(`${code}: ${publicMessage}`);
    this.name = "AppError";
  }
}

/** A problem the customer can fix (shown verbatim). */
export class UserFacingError extends AppError {
  constructor(
    publicMessage: string,
    code = "USER_ERROR",
    context: Record<string, unknown> = {},
  ) {
    super(code, publicMessage, context);
    this.name = "UserFacingError";
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, context: Record<string, unknown> = {}) {
    super("NOT_FOUND", `${entity} not found.`, context);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends AppError {
  constructor(context: Record<string, unknown> = {}) {
    super("FORBIDDEN", "You don't have access to that.", context);
    this.name = "ForbiddenError";
  }
}

/** Customer-safe message for any thrown value. */
export function publicMessage(error: unknown): string {
  return error instanceof AppError
    ? error.publicMessage
    : "Something went wrong. Please try again.";
}
