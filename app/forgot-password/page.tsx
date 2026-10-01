import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/password-forms";
import { Card, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <Section containerClassName="max-w-md">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Forgot it? 🔑
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Happens to the best of us. Enter your email and we&apos;ll send a link
        to set a new password.
      </p>
      <Card className="mt-7">
        <ForgotPasswordForm />
      </Card>
      <p className="mt-5 text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-bold text-primary hover:underline">
          Log in
        </Link>
      </p>
    </Section>
  );
}
