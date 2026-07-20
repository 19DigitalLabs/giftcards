"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

export interface AuthState {
  error?: string;
}

/** Only allow same-site return paths, never external URLs. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

const signupSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name."),
  email: z.string().trim().toLowerCase().email("Please enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { name, email, password } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "That email is already registered — log in instead." };
  }

  const user = await db.user.create({
    data: { name, email, passwordHash: hashPassword(password) },
  });
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email."),
  password: z.string().min(1, "Please enter your password."),
});

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return { error: "Incorrect email or password." };
  }

  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
