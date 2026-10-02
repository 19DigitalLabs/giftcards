import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { usesDemoInbox } from "@/lib/config";
import { db } from "@/lib/db";
import { Card, Notice, Section } from "@/components/ui";

export const metadata: Metadata = {
  title: "Demo inbox",
  robots: { index: false },
};

/**
 * Demo email outbox. Exists only in APP_MODE=demo. Admins see every email;
 * customers see only messages addressed to their own email.
 */
export default async function DemoEmailsPage() {
  if (!usesDemoInbox()) notFound(); // real email is on
  const user = await requireUser("/demo/emails");
  const isAdmin = user.role === "ADMIN";
  const emails = await db.demoEmail.findMany({
    where: isAdmin ? {} : { to: user.email },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <Section containerClassName="max-w-3xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Demo inbox
      </h1>
      <Notice variant="info" className="mt-4">
        Emails aren&apos;t really sent in the demo environment.{" "}
        {isAdmin
          ? "As an admin you see all messages."
          : `Showing messages to ${user.email}.`}
      </Notice>
      {emails.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No emails yet.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {emails.map((e) => (
            <li key={e.id}>
              <Card>
                <p className="text-xs text-muted-foreground">
                  To {e.to} · {e.createdAt.toLocaleString("en-IN")} ·{" "}
                  {e.template}
                </p>
                <p className="mt-1 font-display font-extrabold">{e.subject}</p>
                {e.html && (
                  // Sandboxed: no scripts; links may open in a new tab.
                  <iframe
                    title={e.subject}
                    srcDoc={e.html}
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    className="mt-3 h-[640px] w-full rounded-2xl border border-border bg-background"
                  />
                )}
                <details className="mt-3" open={!e.html}>
                  <summary className="cursor-pointer text-xs font-bold text-muted-foreground">
                    Plain-text version
                  </summary>
                  <pre className="mt-3 text-sm whitespace-pre-wrap text-muted-foreground">
                    {e.text.split(/(https?:\/\/\S+)/).map((part, i) =>
                      /^https?:\/\//.test(part) ? (
                        <a
                          key={i}
                          href={part}
                          className="break-all text-primary underline"
                        >
                          {part}
                        </a>
                      ) : (
                        part
                      ),
                    )}
                  </pre>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
