"use client";

import { useActionState } from "react";
import {
  startCheckoutAction,
  type CheckoutState,
} from "@/lib/actions/checkout";
import { SubmitButton } from "@/components/submit-button";
import { Notice } from "@/components/ui";

/**
 * Pay button. `checkoutKey` was minted by the server for this page view;
 * resubmitting (double click, retry) reuses it, so the server returns the
 * same order instead of creating a second one.
 */
export function CheckoutForm({
  checkoutKey,
  payLabel,
  disabled,
  isDemo,
}: {
  checkoutKey: string;
  payLabel: string;
  disabled?: boolean;
  isDemo: boolean;
}) {
  const [state, formAction] = useActionState<CheckoutState, FormData>(
    startCheckoutAction,
    {},
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="checkoutKey" value={checkoutKey} />
      {isDemo && (
        <Notice variant="info" className="text-xs">
          Test mode — you&apos;ll be taken to a simulated payment page. No money
          will be charged.
        </Notice>
      )}
      {state.error && <Notice variant="error">{state.error}</Notice>}
      <SubmitButton
        size="lg"
        className="w-full"
        disabled={disabled}
        pendingLabel="Taking you to payment…"
      >
        {payLabel}
      </SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        By paying you agree to our{" "}
        <a href="/terms" className="underline">
          terms
        </a>{" "}
        and{" "}
        <a href="/refund-policy" className="underline">
          refund policy
        </a>
        .
      </p>
    </form>
  );
}
