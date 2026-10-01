import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { Card, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({
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
        Create your account
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Track your orders and keep every gift card in one place.
      </p>
      <Card className="mt-7">
        <AuthForm mode="signup" next={next} />
      </Card>
    </Section>
  );
}
