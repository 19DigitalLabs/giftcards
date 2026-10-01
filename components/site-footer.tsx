import Link from "next/link";
import { company } from "@/lib/company";
import { siteConfig } from "@/lib/site";
import { Container } from "@/components/ui";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/50">
      <Container className="grid gap-6 py-8 text-sm sm:grid-cols-[1fr_auto]">
        <div className="space-y-2 text-muted-foreground">
          <p className="font-bold text-foreground">{company.brandName}</p>
          <p className="max-w-xl text-xs">
            Gift cards are issued by their respective brands/issuers and
            supplied through authorised distribution partners. Brand names and
            logos belong to their owners and don&apos;t imply endorsement.
          </p>
          <p className="text-xs">
            © {new Date().getFullYear()} {company.legalName}
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
            {siteConfig.legal.map((item) => (
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
