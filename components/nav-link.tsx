"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@platform/utils";

/** Pill nav item — the active route gets a filled capsule. */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
