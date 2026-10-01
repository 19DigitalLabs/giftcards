import Link from "next/link";
import { listBrands } from "@/lib/catalogue/queries";
import { BrandCard } from "@/components/brand-card";
import { BrandSearch } from "@/components/brand-search";
import { buttonClasses, Card, Section, Tag } from "@/components/ui";

const steps = [
  {
    icon: "🔎",
    title: "Choose a brand",
    text: "Pick a gift card and a value that suits you.",
  },
  {
    icon: "🔒",
    title: "Pay securely",
    text: "Checkout through our payment partner. Your price is shown upfront.",
  },
  {
    icon: "⚡",
    title: "Get your code",
    text: "Your gift card appears in your account as soon as it's issued.",
  },
];

export default async function HomePage() {
  const [featured, all] = await Promise.all([
    listBrands({ featured: true }),
    listBrands(),
  ]);
  const ticker = all.slice(0, 12);

  return (
    <>
      <Section className="relative overflow-hidden pb-10 sm:pb-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-accent/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-10 right-0 size-80 rounded-full bg-pink/15 blur-3xl"
        />
        <div className="relative">
          <Tag variant="violet">Digital gift cards · India</Tag>
          <h1 className="mt-5 max-w-3xl font-display text-5xl font-extrabold tracking-tight sm:text-6xl">
            Gift cards for the brands{" "}
            <span className="text-gradient">you actually use</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Shopping, food, travel and entertainment — {all.length} brands,
            clear pricing, and your code delivered straight to your account.
          </p>
          <BrandSearch className="mt-8 max-w-xl" />
        </div>
      </Section>

      {ticker.length > 0 && (
        <div className="overflow-hidden border-y border-border bg-card/60 py-3">
          <div className="flex w-max animate-ticker gap-8">
            {[...ticker, ...ticker].map(({ brand }, i) => (
              <Link
                key={`${brand.id}-${i}`}
                href={`/brands/${brand.slug}`}
                className="flex shrink-0 items-center gap-2 text-sm font-bold whitespace-nowrap text-muted-foreground transition-colors hover:text-primary"
              >
                <span style={{ color: brand.color }}>●</span>
                {brand.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <Section>
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-extrabold tracking-tight">
            Popular brands
          </h2>
          <Link
            href="/brands"
            className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-bold transition-colors hover:border-primary/60 hover:text-primary"
          >
            All brands →
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((s) => (
            <BrandCard key={s.brand.id} summary={s} />
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <h2 className="font-display text-3xl font-extrabold tracking-tight">
          How it works
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {steps.map((step) => (
            <Card key={step.title}>
              <p className="text-3xl">{step.icon}</p>
              <h3 className="mt-3 font-display text-lg font-extrabold">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {step.text}
              </p>
            </Card>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start gap-5 rounded-3xl bg-gradient-to-br from-accent/30 via-pink/20 to-orange/15 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <h2 className="font-display text-2xl font-extrabold sm:text-3xl">
              Questions about an order?
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Our support team can help with payments, delivery and refunds.
            </p>
          </div>
          <Link
            href="/support"
            className={buttonClasses({ size: "lg", variant: "outline" })}
          >
            Get support
          </Link>
        </div>
      </Section>
    </>
  );
}
