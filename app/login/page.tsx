import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { Card, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next =
    typeof params.next === "string" &&
    params.next.startsWith("/") &&
    !params.next.startsWith("//")
      ? params.next
      : "/";
  if (await getSessionUser()) redirect(next);

  return (
    <Section containerClassName="max-w-md">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Welcome back
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Log in to see your orders and gift cards.
      </p>
      <Card className="mt-7">
        <AuthForm mode="login" next={next} />
      </Card>
    </Section>
  );
}
