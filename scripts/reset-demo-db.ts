/*
 * DESTRUCTIVE: wipes every table of a DEMO database, then re-seeds it.
 *
 *   pnpm db:reset-demo --confirm <database-name>
 *
 * Guards (all must pass):
 *   - APP_MODE must be "demo"
 *   - --confirm must equal the database name in DATABASE_URL
 *   - on a deployed environment (NODE_ENV=production or VERCEL=1) you must
 *     also set ALLOW_DEMO_RESET=true
 * A live database can never be wiped by this script.
 */
import { appMode } from "../lib/config";
import { db } from "../lib/db";
import { seedDemo } from "../prisma/seed";

function databaseName(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return new URL(url).pathname.replace(/^\//, "");
}

async function main() {
  if (appMode() !== "demo")
    throw new Error("Refusing: APP_MODE is not 'demo'.");
  const name = databaseName();
  const idx = process.argv.indexOf("--confirm");
  const confirm = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (confirm !== name) {
    throw new Error(
      `Refusing: pass --confirm ${name} to wipe database "${name}".`,
    );
  }
  const deployed =
    process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (deployed && process.env.ALLOW_DEMO_RESET !== "true") {
    throw new Error(
      "Refusing on a deployed environment without ALLOW_DEMO_RESET=true.",
    );
  }

  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  // TRUNCATE doesn't fire the ledger's UPDATE/DELETE trigger — intended:
  // this is a whole-database demo reset, not a ledger edit.
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  console.log(`Wiped ${tables.length} tables in "${name}".`);
  await seedDemo();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
