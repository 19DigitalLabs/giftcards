import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomToken, sha256 } from "./crypto";
import { db } from "./db";

const SESSION_COOKIE = "gifts19_session";
const SESSION_DAYS = 30;

/*
 * The cookie carries a random token; the DB keeps only its SHA-256, so a
 * leaked database can't be replayed as live sessions.
 */

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  );
  await db.session.deleteMany({ where: { userId, expiresAt: { lt: now } } });
  await db.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

async function currentTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

export async function destroySession(): Promise<void> {
  const tokenHash = await currentTokenHash();
  if (tokenHash) await db.session.deleteMany({ where: { tokenHash } });
  (await cookies()).delete(SESSION_COOKIE);
}

/** Signs the user out everywhere except this browser (after a password change). */
export async function destroyOtherSessions(userId: string): Promise<void> {
  const tokenHash = await currentTokenHash();
  await db.session.deleteMany({
    where: { userId, ...(tokenHash ? { tokenHash: { not: tokenHash } } : {}) },
  });
}

/** Signs the user out on every device, this one included. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
  (await cookies()).delete(SESSION_COOKIE);
}

/** The logged-in user, or null. Cached per request. */
export const getSessionUser = cache(async () => {
  const tokenHash = await currentTokenHash();
  if (!tokenHash) return null;
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

/** Guard for protected pages — bounces to /login with a return path. */
export async function requireUser(next: string) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
