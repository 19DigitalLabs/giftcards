"use server";

import { redirect } from "next/navigation";
import {
  authenticate,
  registerUser,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} from "@/lib/auth-service";
import {
  createSession,
  destroyAllSessions,
  destroyOtherSessions,
  destroySession,
  getSessionUser,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, publicMessage } from "@/lib/errors";
import { log } from "@/lib/log";
import {
  hashPassword,
  newPasswordSchema,
  verifyPassword,
} from "@/lib/password";
import { rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

export interface AuthState {
  error?: string;
  success?: string;
}

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

async function ipKey(prefix: string): Promise<string | null> {
  const ip = await clientIp();
  return ip ? `${prefix}:${ip}` : null;
}

function failure(error: unknown): AuthState {
  if (!(error instanceof AppError)) log.error("auth.unexpected", { error });
  return { error: publicMessage(error) };
}

async function limited(
  key: string | null,
  limit: number,
  windowMs: number,
): Promise<AuthState | null> {
  if (!key) return null; // no trustworthy client IP: rely on per-account limits
  const result = await rateLimit(key, limit, windowMs);
  return result.ok ? null : { error: tooManyAttempts(result.retryAfter) };
}

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const blocked = await limited(await ipKey("signup"), 10, 60 * MINUTE);
  if (blocked) return blocked;
  try {
    const user = await registerUser({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    await createSession(user.id);
  } catch (error) {
    return failure(error);
  }
  redirect(
    `/verify-email?sent=1&next=${encodeURIComponent(safeNext(formData.get("next")))}`,
  );
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const blocked =
    (await limited(await ipKey("login-ip"), 30, 15 * MINUTE)) ??
    (await limited(`login-email:${email}`, 10, 15 * MINUTE));
  if (blocked) return blocked;
  try {
    const user = await authenticate(
      email,
      String(formData.get("password") ?? ""),
    );
    await createSession(user.id);
  } catch (error) {
    return failure(error);
  }
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

/** Same answer whether or not the email has an account. */
export async function requestPasswordResetAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const blocked =
    (await limited(await ipKey("reset-ip"), 10, 15 * MINUTE)) ??
    (await limited(`reset-email:${email}`, 3, 15 * MINUTE));
  if (blocked) return blocked;
  try {
    await requestPasswordReset(email);
  } catch (error) {
    return failure(error);
  }
  return {
    success:
      "If that email has an account, a reset link is on its way. It works for 30 minutes.",
  };
}

export async function resetPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const blocked = await limited(await ipKey("reset-use"), 10, 15 * MINUTE);
  if (blocked) return blocked;
  if (formData.get("password") !== formData.get("confirm"))
    return { error: "Passwords don't match." };
  try {
    const userId = await resetPassword(
      String(formData.get("token") ?? ""),
      formData.get("password"),
    );
    await createSession(userId);
  } catch (error) {
    return failure(error);
  }
  redirect("/account?password=reset");
}

export async function changePasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Faccount");
  const blocked = await limited(`change-pw:${user.id}`, 5, 15 * MINUTE);
  if (blocked) return blocked;

  const current = String(formData.get("current") ?? "");
  const parsed = newPasswordSchema.safeParse(formData.get("password"));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  if (parsed.data !== formData.get("confirm"))
    return { error: "New passwords don't match." };
  if (parsed.data === current)
    return {
      error: "Pick a new password that's different from the current one.",
    };
  if (!(await verifyPassword(current, user.passwordHash)))
    return { error: "Your current password is incorrect." };

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data) },
  });
  await destroyOtherSessions(user.id);
  return { success: "Password updated. Other devices have been signed out." };
}

export async function resendVerificationAction(
  _prev: AuthState,
): Promise<AuthState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.emailVerifiedAt)
    return { success: "Your email is already verified." };
  const blocked = await limited(`verify-resend:${user.id}`, 3, 15 * MINUTE);
  if (blocked) return blocked;
  await sendVerificationEmail(user);
  return { success: `We've sent a new verification link to ${user.email}.` };
}
