"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/account", label: "Profile", icon: "👤" },
  { href: "/orders", label: "My orders", icon: "📦" },
  { href: "/account/saved", label: "Saved brands", icon: "♡" },
  { href: "/account/support", label: "Support tickets", icon: "💬" },
  { href: "/account/security", label: "Login & security", icon: "🔒" },
];

export function AccountNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/account" ? pathname === "/account" : pathname.startsWith(href);

  return (
    <nav aria-label="Account" className="lg:sticky lg:top-24 lg:self-start">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
        {LINKS.map((link) => (
          <li key={link.href} className="shrink-0">
            <Link
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold whitespace-nowrap transition-colors",
                isActive(link.href)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span aria-hidden className="w-4 text-center">
                {link.icon}
              </span>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
