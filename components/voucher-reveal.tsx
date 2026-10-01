"use client";

import { useActionState, useState } from "react";
import { revealVoucherAction, type RevealState } from "@/lib/actions/checkout";

/**
 * A masked voucher ("•••• •••• 1234"). Reveal asks the server for this ONE
 * voucher (ownership-checked, rate-limited, audited); the code is never in
 * the page until then.
 */
export function VoucherReveal({
  voucherId,
  masked,
  isTest,
}: {
  voucherId: string;
  masked: string;
  isTest: boolean;
}) {
  const [state, formAction, pending] = useActionState<RevealState, FormData>(
    revealVoucherAction,
    {},
  );
  const [copied, setCopied] = useState(false);
  const voucher = state.voucher;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (http) — the code is visible anyway */
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      {isTest && (
        <p className="mb-2 inline-flex rounded-full bg-orange/15 px-3 py-1 text-[11px] font-extrabold tracking-wider text-orange uppercase">
          Test voucher · not redeemable
        </p>
      )}
      {voucher ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold break-all text-primary">
              {voucher.code}
            </span>
            <button
              type="button"
              onClick={() => copy(voucher.code)}
              className="rounded-full border border-border px-3 py-1 text-xs font-bold hover:border-primary/60"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          {voucher.pin && (
            <p className="text-sm">
              PIN:{" "}
              <span className="font-mono font-bold text-primary">
                {voucher.pin}
              </span>
            </p>
          )}
        </div>
      ) : (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="voucherId" value={voucherId} />
          <span className="font-mono text-base font-bold tracking-wider">
            {masked}
          </span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Revealing…" : "Reveal"}
          </button>
        </form>
      )}
      {state.error && (
        <p className="mt-2 text-xs font-bold text-pink">{state.error}</p>
      )}
    </div>
  );
}
