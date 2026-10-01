import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/password-forms";
import { buttonClasses, Card, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;

  return (
    <Section containerClassName="max-w-md">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Set a new password
      </h1>
      {typeof token === "string" && token ? (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Pick a new password. You&apos;ll be signed out of every other
            device.
          </p>
          <Card className="mt-7">
            <ResetPasswordForm token={token} />
          </Card>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            This link is missing its reset token. Request a fresh one.
          </p>
          <Link
            href="/forgot-password"
            className={`mt-7 inline-flex ${buttonClasses({ size: "lg" })}`}
          >
            Request a new link
          </Link>
        </>
      )}
    </Section>
  );
}
