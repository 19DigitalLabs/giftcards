/*
 * Demo seed — NON-DESTRUCTIVE. Safe to run repeatedly; it only creates or
 * updates, never deletes:
 *   1. the demo supplier's own catalogue/balance (simulated external system)
 *   2. our Brand/Product tables, via the real catalogue sync
 *   3. a demo admin from DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD (if set)
 *
 * Refuses to run in APP_MODE=live. To wipe a DEMO database use
 * `pnpm db:reset-demo` (separately guarded).
 *
 *   pnpm db:seed
 */
import { appMode } from "../lib/config";
import { syncCatalogue } from "../lib/catalogue/sync";
import { db } from "../lib/db";
import { seedDemoProvider } from "../lib/demo/provider-server";
import { hashPassword, newPasswordSchema } from "../lib/password";

async function ensureUser(
  email: string,
  password: string,
  name: string,
  role: "ADMIN" | "CUSTOMER",
) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== role && role === "ADMIN") {
      await db.user.update({ where: { id: existing.id }, data: { role } });
    }
    return "exists";
  }
  if (!newPasswordSchema.safeParse(password).success) {
    throw new Error(
      `Password for ${email} doesn't meet the policy (8+ chars, a letter and a number).`,
    );
  }
  await db.user.create({
    data: {
      email,
      name,
      role,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
    },
  });
  return "created";
}

export async function seedDemo() {
  if (appMode() !== "demo") {
    throw new Error("Refusing to seed demo data: APP_MODE is not 'demo'.");
  }
  await seedDemoProvider();
  const summary = await syncCatalogue("DEMO");
  console.log(
    `Catalogue: ${summary.brandsCreated} brands created / ${summary.brandsUpdated} updated; ` +
      `${summary.productsCreated} products created / ${summary.productsUpdated} updated.`,
  );

  const adminEmail = process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    console.log(
      `Demo admin ${adminEmail}: ${await ensureUser(adminEmail, adminPassword, "Demo Admin", "ADMIN")}`,
    );
  } else {
    console.log(
      "No DEMO_ADMIN_EMAIL/DEMO_ADMIN_PASSWORD set — skipped demo admin (use pnpm admin:create).",
    );
  }
  const customerEmail = process.env.DEMO_CUSTOMER_EMAIL?.trim().toLowerCase();
  const customerPassword = process.env.DEMO_CUSTOMER_PASSWORD;
  if (customerEmail && customerPassword) {
    console.log(
      `Demo customer ${customerEmail}: ${await ensureUser(customerEmail, customerPassword, "Demo Customer", "CUSTOMER")}`,
    );
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed.ts")) {
  seedDemo()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
