# gifts19

Gift card store — browse brands, buy gift cards at a discount, track orders.
Next.js (App Router), TypeScript (strict), Tailwind CSS v4, Prisma (SQLite in dev).

Split out of the `platform` monorepo; it is fully standalone.

## Getting started

Requires Node.js ≥ 20.9 and pnpm.

```sh
pnpm install
cp .env.example .env
pnpm db:push && pnpm db:seed
pnpm dev          # http://localhost:3001
```

Other commands: `pnpm build`, `pnpm lint`, `pnpm type-check`, `pnpm format`.
