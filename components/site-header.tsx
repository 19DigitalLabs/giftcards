import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { siteConfig } from "@/lib/site";
import { Logo } from "@/components/logo";
import { NavLink } from "@/components/nav-link";
import { UserMenu } from "@/components/user-menu";
import { buttonClasses, Container } from "@/components/ui";

export async function SiteHeader() {
  const user = await getSessionUser();
  const cartCount = user
    ? ((
        await db.cartItem.aggregate({
          _sum: { quantity: true },
          where: { userId: user.id },
        })
      )._sum.quantity ?? 0)
    : 0;
  const isStaff = user?.role === "ADMIN" || user?.role === "SUPPORT";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-7">
          <Logo />
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1 rounded-full border border-border bg-foreground/5 p-1">
              {siteConfig.nav.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href} label={item.label} />
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/cart"
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
            className="flex items-center gap-1.5 rounded-full border border-border bg-foreground/5 px-4 py-2 text-sm font-bold transition-colors hover:border-primary/50 hover:text-primary"
          >
            🛒
            <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
              {cartCount}
            </span>
          </Link>
          {user ? (
            <UserMenu name={user.name} email={user.email} isStaff={isStaff} />
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-full px-3 py-2 text-sm font-bold transition-colors hover:text-primary sm:block"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className={buttonClasses({
                  size: "sm",
                  className: "hidden sm:inline-flex",
                })}
              >
                Sign up
              </Link>
            </>
          )}
          {/* Mobile menu: <details> works without JavaScript. */}
          <details className="group relative md:hidden">
            <summary
              aria-label="Menu"
              className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-foreground/5 text-lg [&::-webkit-details-marker]:hidden"
            >
              <span className="group-open:hidden">☰</span>
              <span className="hidden group-open:inline">✕</span>
            </summary>
            <nav
              aria-label="Mobile"
              className="absolute top-12 right-0 w-56 rounded-2xl border border-border bg-card p-2 shadow-violet"
            >
              <ul className="space-y-1 text-sm font-bold">
                {[
                  ...siteConfig.nav,
                  ...(user
                    ? []
                    : [
                        { label: "Log in", href: "/login" },
                        { label: "Sign up", href: "/signup" },
                      ]),
                ].map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-xl px-3 py-2.5 hover:bg-muted"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </Container>
    </header>
  );
}
