"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** A voucher code, masked until tapped (no shoulder-surfing), with copy. */
export function VoucherCode({ code }: { code: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const masked =
    code.slice(0, -4).replace(/[A-Za-z0-9]/g, "•") + code.slice(-4);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setRevealed(true); // clipboard blocked (e.g. plain http on LAN): show it instead
    }
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pr-1 pl-4 font-mono text-sm font-bold text-primary">
      <span className={cn(!revealed && "tracking-wider")}>
        {revealed ? code : masked}
      </span>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="rounded-full px-2.5 py-1 font-sans text-xs hover:bg-primary/15"
      >
        {revealed ? "Hide" : "Show"}
      </button>
      <button
        type="button"
        onClick={copy}
        className="rounded-full px-2.5 py-1 font-sans text-xs hover:bg-primary/15"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </span>
  );
}
