"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { checkOrderProgressAction } from "@/lib/actions/checkout";
import { Button } from "@/components/ui";

const POLL_MS = 4000;

/**
 * While payment or fulfilment is in progress, asks the server every few
 * seconds (which checks the gateway and nudges fulfilment) and refreshes
 * the page when the status changes.
 */
export function OrderProgressPoller({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const router = useRouter();
  const [checking, startTransition] = useTransition();
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const current = useRef(status);

  const check = () =>
    startTransition(async () => {
      const next = await checkOrderProgressAction(orderId);
      setLastChecked(new Date().toLocaleTimeString("en-IN"));
      if (next && next !== current.current) {
        current.current = next;
        router.refresh();
      }
    });

  useEffect(() => {
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [orderId]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button variant="outline" onClick={check} disabled={checking}>
        {checking ? "Checking…" : "Check status"}
      </Button>
      <span className="text-xs text-muted-foreground" aria-live="polite">
        Updating automatically{lastChecked && ` · last checked ${lastChecked}`}
      </span>
    </div>
  );
}
