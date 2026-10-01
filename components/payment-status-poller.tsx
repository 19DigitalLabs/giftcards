"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { checkPaymentStatusAction } from "@/lib/actions/checkout";
import { Button } from "@/components/ui";

const POLL_MS = 4000;

/**
 * While an order's payment is pending, asks the server every few seconds
 * (which asks the gateway) and re-renders the page once it settles.
 */
export function PaymentStatusPoller({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [checking, startTransition] = useTransition();
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  function check() {
    startTransition(async () => {
      const status = await checkPaymentStatusAction(orderId);
      setLastChecked(new Date());
      if (status !== "PENDING") router.refresh();
    });
  }

  useEffect(() => {
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [orderId]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" onClick={check} disabled={checking}>
        {checking ? "Checking…" : "Check status now 🔄"}
      </Button>
      <span className="text-xs text-muted-foreground" aria-live="polite">
        Auto-checking every {POLL_MS / 1000}s
        {lastChecked && ` · last checked ${lastChecked.toLocaleTimeString()}`}
      </span>
    </div>
  );
}
