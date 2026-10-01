import Link from "next/link";
import { cn } from "@/lib/utils";

/** The gifts19 mark: gradient gift tile + chunky lowercase wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent via-pink to-orange text-base"
      >
        🎁
      </span>
      <span className="font-display text-xl font-extrabold tracking-tight">
        gifts<span className="text-primary">19</span>
      </span>
    </Link>
  );
}
