import type { AuthTokenPurpose, User } from "@prisma/client";
import { z } from "zod";
import { siteUrl } from "./config";
import { randomToken, sha256 } from "./crypto";
import { db, isUniqueViolation } from "./db";
import { sendTemplateEmail } from "./email/service";
import { UserFacingError } from "./errors";
import {
  hashPassword,
  newPasswordSchema,
  verifyAgainstDummy,
  verifyPassword,
} from "./password";

/*
 * Authentication core — pure business logic with no cookies/headers, so
 * it's unit-testable. lib/actions/auth.ts wraps it with sessions, rate
 * limits and redirects.
 */

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const MINUTE = 60 * 1000;
const TOKEN_TTL: Record<AuthTokenPurpose, number> = {
  PASSWORD_RESET: 30 * MINUTE,
  EMAIL_VERIFICATION: 24 * 60 * MINUTE,
};

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "That email is too long.")
  .email("Please enter a valid email.");

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your name.")
    .max(80, "That name is too long."),
  email: emailSchema,
  password: newPasswordSchema,
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new UserFacingError(firstIssue(parsed.error), "VALIDATION");
  return parsed.data;
}

/** Issues a one-time token; only its hash is stored. Returns the raw token. */
export async function issueAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
): Promise<string> {
  const token = randomToken();
  await db.authToken.deleteMany({ where: { userId, purpose, usedAt: null } });
  await db.authToken.create({
    data: {
      tokenHash: sha256(token),
      userId,
      purpose,
      expiresAt: new Date(Date.now() + TOKEN_TTL[purpose]),
    },
  });
  return token;
}

/** Validates and burns a token. Returns its user id, or null if invalid/expired/used. */
export async function consumeAuthToken(
  token: string,
  purpose: AuthTokenPurpose,
): Promise<string | null> {
  const tokenHash = sha256(token);
  const { count } = await db.authToken.updateMany({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (count === 0) return null;
  return (await db.authToken.findUniqueOrThrow({ where: { tokenHash } }))
    .userId;
}

export async function sendVerificationEmail(
  user: Pick<User, "id" | "name" | "email">,
  welcome = false,
) {
  const token = await issueAuthToken(user.id, "EMAIL_VERIFICATION");
  await sendTemplateEmail(
    welcome ? "WELCOME_VERIFY" : "VERIFY_EMAIL",
    user.email,
    {
      name: user.name,
      link: `${siteUrl()}/verify-email?token=${token}`,
    },
  );
}

export async function registerUser(input: {
  name: unknown;
  email: unknown;
  password: unknown;
}): Promise<User> {
  const { name, email, password } = parseOrThrow(signupSchema, input);
  let user: User;
  try {
    user = await db.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new UserFacingError(
        "That email is already registered — log in instead.",
        "EMAIL_TAKEN",
      );
    }
    throw error;
  }
  await sendVerificationEmail(user, true);
  return user;
}

export async function verifyEmailToken(token: string): Promise<User | null> {
  const userId = await consumeAuthToken(token, "EMAIL_VERIFICATION");
  if (!userId) return null;
  return db.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });
}

/**
 * Checks credentials with per-account lockout. Unknown emails cost the
 * same scrypt time as real ones.
 */
export async function authenticate(
  emailInput: unknown,
  password: string,
): Promise<User> {
  const email = parseOrThrow(emailSchema, emailInput);
  if (!password || password.length > 128)
    throw new UserFacingError(
      "Incorrect email or password.",
      "BAD_CREDENTIALS",
    );
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await verifyAgainstDummy(password);
    throw new UserFacingError(
      "Incorrect email or password.",
      "BAD_CREDENTIALS",
    );
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / MINUTE,
    );
    throw new UserFacingError(
      `Too many attempts — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      "LOCKED",
    );
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * MINUTE) : null,
      },
    });
    throw new UserFacingError(
      lock
        ? `Too many wrong passwords — your account is locked for ${LOCK_MINUTES} minutes. You can reset your password instead.`
        : "Incorrect email or password.",
      lock ? "LOCKED" : "BAD_CREDENTIALS",
    );
  }
  if (user.status === "BLOCKED")
    throw new UserFacingError(
      "This account has been suspended. Contact support.",
      "BLOCKED",
    );
  if (user.failedLogins > 0 || user.lockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }
  return user;
}

/** Emails a reset link if the account exists. Same outcome either way. */
export async function requestPasswordReset(emailInput: unknown): Promise<void> {
  const email = parseOrThrow(emailSchema, emailInput);
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.status === "BLOCKED") return;
  const token = await issueAuthToken(user.id, "PASSWORD_RESET");
  await sendTemplateEmail("PASSWORD_RESET", user.email, {
    name: user.name,
    link: `${siteUrl()}/reset-password?token=${token}`,
  });
}

/** Sets a new password from a reset token; signs out every session. */
export async function resetPassword(
  token: string,
  password: unknown,
): Promise<string> {
  const newPassword = parseOrThrow(newPasswordSchema, password);
  const userId = await consumeAuthToken(token, "PASSWORD_RESET");
  if (!userId)
    throw new UserFacingError(
      "This reset link is invalid or has expired — request a new one.",
      "BAD_TOKEN",
    );
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      // Proving control of the inbox also verifies the email.
      data: {
        passwordHash,
        failedLogins: 0,
        lockedUntil: null,
        emailVerifiedAt: new Date(),
      },
    }),
    db.session.deleteMany({ where: { userId } }),
  ]);
  return userId;
}
