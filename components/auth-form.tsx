"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type AuthState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";

const inputClasses =
  "h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition-colors focus:border-primary/60 placeholder:text-muted-foreground";

/** Login/signup form driven by the matching server action. */
export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
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
            autoComplete="name"
            placeholder="What do we call you?"
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
          autoComplete="email"
          placeholder="you@wherever.in"
          className={`mt-1.5 ${inputClasses}`}
        />
      </label>
      <label className="block text-sm">
        <span className="font-bold">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 8 : 1}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? "8+ characters, make it strong 💪" : "••••••••"}
          className={`mt-1.5 ${inputClasses}`}
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-2xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm font-bold text-pink"
        >
          {state.error}
        </p>
      )}

      <SubmitButton size="lg" className="w-full">
        {mode === "login" ? "Log in →" : "Create account ✨"}
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
