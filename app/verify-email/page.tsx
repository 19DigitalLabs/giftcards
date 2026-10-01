import type { Metadata } from "next";
import Link from "next/link";
import { verifyEmailToken } from "@/lib/auth-service";
import { getSessionUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { ResendVerificationForm } from "@/components/resend-verification-form";
import { buttonClasses, Card, Notice, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
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
  const user = await getSessionUser();

  if (typeof params.token === "string") {
    const verified = await verifyEmailToken(params.token);
    return (
      <Section containerClassName="max-w-md" className="text-center">
        <p className="text-6xl">{verified ? "✅" : "⚠️"}</p>
        <h1 className="mt-4 font-display text-3xl font-extrabold">
          {verified ? "Email verified" : "Link invalid or expired"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {verified
            ? "You're all set to buy gift cards."
            : "Request a new verification email from your account."}
        </p>
        <Link
          href={verified ? "/brands" : "/account"}
          className={`mt-7 inline-flex ${buttonClasses({ size: "lg" })}`}
        >
          {verified ? "Browse brands" : "Go to account"}
        </Link>
      </Section>
    );
  }

  return (
    <Section containerClassName="max-w-md">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Check your inbox
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        We&apos;ve sent a verification link{user ? ` to ${user.email}` : ""}.
        Click it to confirm your email — you&apos;ll need that before buying a
        gift card.
      </p>
      {isDemoMode() && (
        <Notice variant="info" className="mt-6">
          Demo environment: emails aren&apos;t really sent.{" "}
          <Link href="/demo/emails" className="underline">
            Open the demo inbox
          </Link>{" "}
          to click your link.
        </Notice>
      )}
      <Card className="mt-6 space-y-4">
        {user && !user.emailVerifiedAt && <ResendVerificationForm />}
        <Link
          href={next}
          className={`w-full ${buttonClasses({ variant: "outline" })}`}
        >
          Continue
        </Link>
      </Card>
    </Section>
  );
}
