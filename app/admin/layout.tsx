import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false },
};

/* Ops console. Non-staff get a 404 (the console isn't advertised). */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireStaff();
  const links = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/catalogue", label: "Catalogue" },
    { href: "/admin/reconciliation", label: "Reconciliation" },
    { href: "/admin/support", label: "Support" },
    { href: "/admin/users", label: "Users" },
    ...(isDemoMode() ? [{ href: "/admin/demo-lab", label: "Demo lab" }] : []),
  ];
  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-display text-sm font-extrabold tracking-widest text-muted-foreground uppercase">
          Ops console · {user.role.toLowerCase()}
        </p>
        <nav aria-label="Admin">
          <ul className="flex flex-wrap gap-1.5 text-sm font-bold">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="rounded-full border border-border px-3 py-1.5 hover:border-primary/60 hover:text-primary"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mt-8">{children}</div>
    </Container>
  );
}
