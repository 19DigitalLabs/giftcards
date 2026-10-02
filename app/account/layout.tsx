import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { AccountNav } from "@/components/account-nav";
import { Container } from "@/components/ui";

/** Account area: sidebar (desktop) / scrolling tabs (mobile) + content. */
export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser("/account");
  return (
    <Container className="py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
          My account
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
          Hi, {user.name}
        </h1>
      </div>
      <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
