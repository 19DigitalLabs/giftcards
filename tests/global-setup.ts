import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

/*
 * Resolves a test database and migrates it:
 *   1. TEST_DATABASE_URL if set (CI),
 *   2. else the local dev server from `pnpm db:start` (gifts19_test db),
 *   3. else a throwaway embedded Postgres on port 5434.
 * The URL is handed to test workers through .local/test-db-url.
 */
const URL_FILE = path.resolve(".local/test-db-url");
let embedded: EmbeddedPostgres | undefined;

function migrate(url: string): boolean {
  try {
    execSync("pnpm prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

export async function setup() {
  mkdirSync(path.dirname(URL_FILE), { recursive: true });
  const candidates = [
    process.env.TEST_DATABASE_URL,
    "postgresql://postgres:postgres@localhost:5433/gifts19_test",
  ].filter(Boolean) as string[];

  for (const url of candidates) {
    if (migrate(url)) {
      writeFileSync(URL_FILE, url);
      return;
    }
  }

  const dir = path.resolve(".local/postgres-test");
  embedded = new EmbeddedPostgres({
    databaseDir: dir,
    port: 5434,
    user: "postgres",
    password: "postgres",
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });
  if (!existsSync(path.join(dir, "PG_VERSION"))) await embedded.initialise();
  await embedded.start();
  await embedded.createDatabase("gifts19_test").catch(() => {});
  const url = "postgresql://postgres:postgres@localhost:5434/gifts19_test";
  if (!migrate(url)) throw new Error("Could not migrate the test database.");
  writeFileSync(URL_FILE, url);
}

export async function teardown() {
  await embedded?.stop();
}
