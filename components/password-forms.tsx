"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  requestPasswordResetAction,
  resetPasswordAction,
  type AuthState,
} from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { inputClasses, Notice } from "@/components/ui";

/** Shown under new-password fields; mirrors newPasswordSchema in lib/password.ts. */
export const PASSWORD_HINT =
  "8+ characters, with at least one letter and one number.";

function PasswordField({
  name,
  label,
  autoComplete,
  hint,
}: {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-bold">{label}</span>
      <input
        name={name}
        type="password"
        required
        minLength={autoComplete === "new-password" ? 8 : 1}
        maxLength={128}
        autoComplete={autoComplete}
        className={`mt-1.5 ${inputClasses}`}
      />
      {hint && (
        <span className="mt-1.5 block text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}

function Feedback({ state }: { state: AuthState }) {
  return (
    <>
      {state.error && <Notice variant="error">{state.error}</Notice>}
      {state.success && <Notice variant="success">{state.success}</Notice>}
      {state.devLink && (
        <Notice variant="info" className="break-all">
          Dev mode — no email provider yet, so here&apos;s the link:{" "}
          <a href={state.devLink} className="underline">
            {state.devLink}
          </a>
        </Notice>
      )}
    </>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(
    requestPasswordResetAction,
    {},
  );
  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm">
        <span className="font-bold">Email</span>
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder="you@wherever.in"
          className={`mt-1.5 ${inputClasses}`}
        />
      </label>
      <Feedback state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(
    resetPasswordAction,
    {},
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <PasswordField
        name="password"
        label="New password"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
      />
      <PasswordField
        name="confirm"
        label="Confirm new password"
        autoComplete="new-password"
      />
      <Feedback state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(
    changePasswordAction,
    {},
  );
  return (
    <form action={formAction} className="space-y-4">
      <PasswordField
        name="current"
        label="Current password"
        autoComplete="current-password"
      />
      <PasswordField
        name="password"
        label="New password"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
      />
      <PasswordField
        name="confirm"
        label="Confirm new password"
        autoComplete="new-password"
      />
      <Feedback state={state} />
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Update password
      </SubmitButton>
    </form>
  );
}
