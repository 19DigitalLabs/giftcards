import { defineConfig } from "vitest/config";

/*
 * Integration tests run against a real PostgreSQL test database (never the
 * dev one). tests/global-setup.ts migrates it — starting a throwaway
 * embedded Postgres if none is reachable — and files run one at a time
 * because they share that database.
 */
export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
