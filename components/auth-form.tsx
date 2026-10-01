"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type AuthState } from "@/lib/actions/auth";
import { PASSWORD_HINT } from "@/components/password-forms";
import { SubmitButton } from "@/components/submit-button";
import { inputClasses, Notice } from "@/components/ui";

/** Login/signup form driven by the matching server action. */
export function AuthForm({
  mode,
  next,
}: {
  mode: "login" | "signup";
  next: string;
}) {
  const action = mode === "login" ? loginAction : signupAction;
  const [state, formAction] = useActionState<AuthState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      {mode === "signup" && (
        <label className="block text-sm">
          <span className="font-bold">Name</span>
          <input
            name="name"
            required
            maxLength={80}
            autoComplete="name"
            placeholder="Your name"
            className={`mt-1.5 ${inputClasses}`}
          />
        </label>
      )}
      <label className="block text-sm">
        <span className="font-bold">Email</span>
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          className={`mt-1.5 ${inputClasses}`}
        />
      </label>
      <label className="block text-sm">
        <span className="flex items-center justify-between font-bold">
          Password
          {mode === "login" && (
            <Link
              href="/forgot-password"
              className="text-xs font-bold text-primary hover:underline"
            >
              Forgot password?
            </Link>
          )}
        </span>
        <input
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 8 : 1}
          maxLength={128}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder="••••••••"
          className={`mt-1.5 ${inputClasses}`}
        />
        {mode === "signup" && (
          <span className="mt-1.5 block text-xs text-muted-foreground">
            {PASSWORD_HINT}
          </span>
        )}
      </label>

      {state.error && <Notice variant="error">{state.error}</Notice>}

      <SubmitButton size="lg" className="w-full">
        {mode === "login" ? "Log in" : "Create account"}
      </SubmitButton>

      <p className="text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link
              href={`/signup?next=${encodeURIComponent(next)}`}
              className="font-bold text-primary hover:underline"
            >
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="font-bold text-primary hover:underline"
            >
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
