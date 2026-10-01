"use client";

import Link from "next/link";
import { buttonClasses, Section } from "@/components/ui";

/* Error boundary: a safe, generic message — details stay in server logs. */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <Section className="text-center">
      <h1 className="font-display text-3xl font-extrabold">
        Something went wrong
      </h1>
      <p className="mt-3 text-muted-foreground">
        Please try again. If it keeps happening, contact support.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-7 flex justify-center gap-3">
        <button onClick={() => retry()} className={buttonClasses()}>
          Try again
        </button>
        <Link href="/support" className={buttonClasses({ variant: "outline" })}>
          Support
        </Link>
      </div>
    </Section>
  );
}
