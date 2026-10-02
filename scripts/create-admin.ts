/*
 * Creates an admin, or promotes an existing user. Works in any APP_MODE.
 * Credentials come from the environment — nothing is hard-coded:
 *
 *   ADMIN_EMAIL=ops@gifts19.com ADMIN_PASSWORD='…' pnpm admin:create
 */
import { db } from "../lib/db";
import { hashPassword, newPasswordSchema } from "../lib/password";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Admin";
  if (!email) throw new Error("Set ADMIN_EMAIL.");

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        role: "ADMIN",
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      },
    });
    console.log(`Promoted ${email} to ADMIN.`);
    return;
  }
  if (!password || !newPasswordSchema.safeParse(password).success) {
    throw new Error(
      "Set ADMIN_PASSWORD (8+ chars, at least one letter and one number).",
    );
  }
  await db.user.create({
    data: {
      email,
      name,
      role: "ADMIN",
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Created ADMIN ${email}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
