"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

export interface UserMenuProps {
  name: string;
  email: string;
  isStaff: boolean;
}

/** "AB" from "Asha Bhat"; first two characters for single words. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const letters =
    parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2);
  return letters.toUpperCase();
}

const ITEMS = [
  { href: "/account", label: "Profile", icon: "👤" },
  { href: "/orders", label: "My orders", icon: "📦" },
  { href: "/account/saved", label: "Saved brands", icon: "♡" },
  { href: "/account/support", label: "Support tickets", icon: "💬" },
  { href: "/account/security", label: "Login & security", icon: "🔒" },
];

/** Avatar button with an account dropdown (closes on outside click / Esc). */
export function UserMenu({ name, email, isStaff }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-border bg-foreground/5 py-1 pr-3 pl-1 text-sm font-bold transition-colors hover:border-primary/50"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-pink text-xs font-extrabold text-white">
          {initials(name)}
        </span>
        <span className="hidden max-w-32 truncate sm:block">{name}</span>
        <span
          aria-hidden
          className={cn(
            "text-xs text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-12 right-0 z-50 w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-violet"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-bold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <ul className="p-1.5 text-sm">
            {ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  role="menuitem"
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted",
                    pathname === item.href && "text-primary",
                  )}
                >
                  <span aria-hidden className="w-4 text-center">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
            {isStaff && (
              <li>
                <Link
                  href="/admin"
                  role="menuitem"
                  className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted"
                >
                  <span aria-hidden className="w-4 text-center">
                    ⚙
                  </span>
                  Admin console
                </Link>
              </li>
            )}
          </ul>
          <form action={logoutAction} className="border-t border-border p-1.5">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-pink transition-colors hover:bg-muted"
            >
              <span aria-hidden className="w-4 text-center">
                ↪
              </span>
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
