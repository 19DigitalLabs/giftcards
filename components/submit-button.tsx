"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui";

/** Form submit button that disables itself and swaps label while pending. */
export function SubmitButton({
  pendingLabel = "Hold up…",
  children,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
