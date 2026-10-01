"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSession,
  destroyAllSessions,
  destroyOtherSessions,
  destroySession,
  getSessionUser,
} from "@/lib/auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/mailer";
import {
  hashPassword,
  newPasswordSchema,
  verifyAgainstDummy,
  verifyPassword,
} from "@/lib/password";
import { rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { clientIp, requestOrigin } from "@/lib/request";

export interface AuthState {
  error?: string;
  success?: string;
  /** Dev only: the reset link that would have been emailed. */
  devLink?: string;
}

/** Wrong passwords in a row before the account locks for LOCK_MINUTES. */
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_MINUTES = 30;
const MINUTE = 60 * 1000;

/** Only allow same-site return paths, never external URLs. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\")
    ? next
    : "/";
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "That email is too long.")
  .email("Please enter a valid email.");

const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your name.")
    .max(80, "That name is too long."),
  email: emailSchema,
  password: newPasswordSchema,
});

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const limit = rateLimit(`signup:${await clientIp()}`, 10, 60 * MINUTE);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfter) };

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { name, email, password } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "That email is already registered — log in instead." };
  }

  const user = await db.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
  });
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Please enter your password.").max(128),
});

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const limit = rateLimit(`login:${await clientIp()}`, 20, 15 * MINUTE);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfter) };

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { email, password } = parsed.data;

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await verifyAgainstDummy(password);
    return { error: "Incorrect email or password." };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return {
      error: tooManyAttempts((user.lockedUntil.getTime() - Date.now()) / 1000),
    };
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
    return {
      error: lock
        ? `Too many wrong passwords — your account is locked for ${LOCK_MINUTES} minutes. You can reset your password instead.`
        : "Incorrect email or password.",
    };
  }

  if (user.failedLogins > 0 || user.lockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

/** Signs out every device (e.g. after losing a phone). */
export async function logoutEverywhereAction(): Promise<void> {
  const user = await getSessionUser();
  if (user) await destroyAllSessions(user.id);
  redirect("/login");
}

/**
 * Emails a one-time reset link. Answers the same whether or not the email
 * has an account, so it can't be used to discover who's registered.
 */
export async function requestPasswordResetAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const limit = rateLimit(`reset:${await clientIp()}`, 5, 15 * MINUTE);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfter) };

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const sent: AuthState = {
    success:
      "If that email has an account, a reset link is on its way. It works for 30 minutes.",
  };
  const user = await db.user.findUnique({ where: { email: parsed.data } });
  if (!user) return sent;

  const token = randomToken();
  await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await db.passwordResetToken.create({
    data: {
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * MINUTE),
    },
  });
  const link = `${await requestOrigin()}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your gifts19 password",
    text: `Hi ${user.name},\n\nReset your password here (valid ${RESET_TOKEN_MINUTES} minutes):\n${link}\n\nDidn't ask for this? Ignore this email — your password stays the same.`,
  });
  // No email provider yet: hand the link to the developer directly.
  return process.env.NODE_ENV === "production"
    ? sent
    : { ...sent, devLink: link };
}

const resetSchema = z
  .object({
    token: z.string().min(1),
    password: newPasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match.",
  });

export async function resetPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const limit = rateLimit(`reset-use:${await clientIp()}`, 10, 15 * MINUTE);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfter) };

  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: sha256(parsed.data.token) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return {
      error: "This reset link is invalid or has expired — request a new one.",
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLogins: 0, lockedUntil: null },
    }),
    db.passwordResetToken.update({
      where: { tokenHash: record.tokenHash },
      data: { usedAt: new Date() },
    }),
    // Whoever had the old password is signed out everywhere.
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  await createSession(record.userId);
  redirect("/account?password=reset");
}

const changeSchema = z
  .object({
    current: z.string().min(1, "Enter your current password.").max(128),
    password: newPasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "New passwords don't match.",
  })
  .refine((v) => v.password !== v.current, {
    message: "Pick a new password that's different from the current one.",
  });

export async function changePasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Faccount");

  const limit = rateLimit(`change-pw:${user.id}`, 5, 15 * MINUTE);
  if (!limit.ok) return { error: tooManyAttempts(limit.retryAfter) };

  const parsed = changeSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { error: "Your current password is incorrect." };
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });
  await destroyOtherSessions(user.id);
  return { success: "Password updated. Other devices have been signed out." };
}
