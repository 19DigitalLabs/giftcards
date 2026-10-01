import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { siteConfig } from "@/lib/site";
import { Logo } from "@/components/logo";
import { NavLink } from "@/components/nav-link";
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

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/75 backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-7">
          <Logo />
          <nav aria-label="Main" className="hidden sm:block">
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
            className="flex items-center gap-1.5 rounded-full border border-border bg-foreground/5 px-4 py-2 text-sm font-bold transition-colors hover:border-primary/50 hover:text-primary"
          >
            🛒
            <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
              {cartCount}
            </span>
          </Link>
          {user ? (
            <Link
              href="/account"
              className="rounded-full px-3 py-2 text-sm font-bold transition-colors hover:text-primary"
            >
              hey, {(user.name.split(" ")[0] ?? user.name).toLowerCase()} ✌️
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-full px-3 py-2 text-sm font-bold transition-colors hover:text-primary sm:block"
              >
                Log in
              </Link>
              <Link href="/signup" className={buttonClasses({ size: "sm" })}>
                Join free
              </Link>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}
