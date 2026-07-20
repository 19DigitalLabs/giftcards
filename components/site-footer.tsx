import Link from "next/link";
import { siteConfig } from "@/lib/site";
import { Container } from "@/components/ui";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/50">
      <Container className="flex flex-col justify-between gap-4 py-6 text-sm sm:flex-row sm:items-center">
        <p className="text-muted-foreground">
          © {new Date().getFullYear()} {siteConfig.organization} · made with 💜
          · Demo store — payments are simulated, no real gift cards are issued.
        </p>
        <nav aria-label="Footer">
          <ul className="flex gap-5">
            {siteConfig.nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="font-bold text-muted-foreground transition-colors hover:text-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
