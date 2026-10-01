"use client";

import { useActionState } from "react";
import { resendVerificationAction, type AuthState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Notice } from "@/components/ui";

export function ResendVerificationForm() {
  const [state, formAction] = useActionState<AuthState>(
    resendVerificationAction,
    {},
  );
  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Notice variant="error">{state.error}</Notice>}
      {state.success && <Notice variant="success">{state.success}</Notice>}
      <SubmitButton
        variant="outline"
        className="w-full"
        pendingLabel="Sending…"
      >
        Resend verification email
      </SubmitButton>
    </form>
  );
}
