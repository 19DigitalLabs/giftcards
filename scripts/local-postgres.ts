/*
 * Runs a real PostgreSQL server for local development and tests — no Docker
 * or system install needed (binaries come from the embedded-postgres npm
 * package). Data lives in .local/postgres and survives restarts.
 *
 *   pnpm db:start        # leave running in its own terminal
 *
 * Connection: postgresql://postgres:postgres@localhost:5433/gifts19
 * (tests use the gifts19_test database on the same server).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PORT = Number(process.env.LOCAL_PG_PORT ?? 5433);
const dataDir = path.resolve(".local/postgres");

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port: PORT,
    user: "postgres",
    password: "postgres",
    persistent: true,
    // UTF-8 regardless of the OS locale (Windows defaults to WIN1252, which
    // can't store "₹").
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: (e) => console.error("[postgres]", e),
  });

  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log(`Initialising a new local Postgres cluster in ${dataDir}…`);
    await pg.initialise();
  }
  await pg.start();
  for (const name of ["gifts19", "gifts19_test"]) {
    await pg.createDatabase(name).catch(() => {}); // already exists
  }
  console.log(
    `Postgres ready on port ${PORT} (databases: gifts19, gifts19_test). Ctrl+C to stop.`,
  );

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
