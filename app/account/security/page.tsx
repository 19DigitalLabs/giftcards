import type { Metadata } from "next";
import { logoutEverywhereAction } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ChangePasswordForm } from "@/components/password-forms";
import { Button, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Login & security" };

export default async function SecurityPage() {
  const user = await requireUser("/account/security");
  const sessions = await db.session.count({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
  });

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-display text-lg font-extrabold">Change password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Other devices are signed out when you change it.
        </p>
        <div className="mt-5 max-w-md">
          <ChangePasswordForm />
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-extrabold">
          Signed-in devices
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You&apos;re signed in on {sessions} device{sessions === 1 ? "" : "s"}.
          Lost a phone or used a shared computer? Sign out everywhere —
          you&apos;ll need to log in again here too.
        </p>
        <form action={logoutEverywhereAction} className="mt-4">
          <Button variant="outline" size="sm">
            Log out of all devices
          </Button>
        </form>
      </Card>
    </div>
  );
}
