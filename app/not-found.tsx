import Link from "next/link";
import { buttonClasses, Section } from "@/components/ui";

export default function NotFound() {
  return (
    <Section className="text-center">
      <p className="font-display text-7xl font-extrabold text-gradient">404</p>
      <h1 className="mt-4 font-display text-3xl font-extrabold">
        This page ghosted us 👻
      </h1>
      <p className="mt-3 text-muted-foreground">
        Maybe the gift card you&apos;re after is on the brands page.
      </p>
      <Link href="/brands" className={`mt-7 inline-flex ${buttonClasses()}`}>
        Browse brands
      </Link>
    </Section>
  );
}
