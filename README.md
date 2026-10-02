# Gifts19

B2C digital gift-card marketplace for India, built as a **demo/staging system that behaves like production**. Every external dependency — payment gateway, gift-card provider, email — sits behind an adapter. Today each adapter is a realistic simulation. Real providers (e.g. Pine Labs/Qwikcilver, Razorpay/Cashfree/PayU, Resend/SES) plug in without touching business logic.

> **No Pine Labs / Qwikcilver API has been implemented.** A `PineLabsGiftCardProvider` must only be written after official API documentation and credentials are received. See [Pine Labs integration placeholder](#pine-labs-integration-placeholder).

Stack: Next.js 16 (App Router, Server Actions), React 19, TypeScript (strict), Tailwind v4, Prisma 6, PostgreSQL, Vitest. Built for Vercel.

---

## Architecture

```
Customer ─▶ Gifts19 UI (pages + server actions)
               │
               ▼
        Checkout service ── lib/orders/checkout.ts   (idempotent order creation, price snapshots)
               │
               ▼
        Order state machine ── lib/orders/state.ts  (ONLY writer of Order.status; leases)
               │
               ▼
        PaymentService ── lib/payments/service.ts   (verify capture → PAID; refunds; double capture)
               │
               ▼
        PaymentGateway (interface) ── lib/payments/types.ts
               ├── DemoPaymentGateway  lib/payments/gateways/demo.ts ──▶ simulated "DemoPay" (lib/demo/gateway-server.ts)
               └── (future) RazorpayGateway / CashfreeGateway …

   PAID ─▶ FulfilmentService ── lib/fulfilment/service.ts  (attempts, lookups, vouchers, ledger)
               │
               ▼
        GiftCardProvider (interface) ── lib/fulfilment/types.ts
               ├── DemoGiftCardProvider  lib/fulfilment/providers/demo.ts ──▶ simulated "DemoCards" (lib/demo/provider-server.ts)
               └── (future) PineLabsGiftCardProvider

   EmailService ── lib/email/service.ts ── DemoEmailProvider (outbox) | (future) Resend/SES
   Ledger (append-only) · AuditLog · Reconciliation · DB rate limiter · structured logs
   Vercel Cron ─▶ /api/internal/cron/process  (payments poll, fulfilment, refunds)
              └▶ /api/internal/cron/reconcile (ours vs gateway vs provider)
```

The simulated gateway and provider have **their own database tables** (`Demo*`) playing the role of other companies' systems. Business logic never reads them; only the demo adapters do.

## Local setup

Requires Node ≥ 20.9 and pnpm.

```sh
pnpm install
cp .env.example .env          # fill in secrets (see below)
pnpm db:start                 # terminal 1: real local Postgres on :5433 (no Docker needed)
pnpm db:deploy                # apply migrations
pnpm db:seed                  # demo supplier + catalogue sync + demo admin
pnpm dev                      # http://localhost:3001
```

### Postgres

`pnpm db:start` runs a real PostgreSQL 17 from the `embedded-postgres` npm package. Data lives in `.local/postgres` and it creates databases `gifts19` and `gifts19_test`. You can use any Postgres instead (Docker, Neon, Supabase…) by setting `DATABASE_URL` / `DIRECT_URL`. No vendor SDK is used.

## Environment variables

| Variable                                   | Local demo              | Vercel demo                                    | Future live                         |
| ------------------------------------------ | ----------------------- | ---------------------------------------------- | ----------------------------------- |
| `APP_MODE`                                 | `demo` (default)        | `demo` **required**                            | `live` **required**                 |
| `DATABASE_URL`                             | local URL               | pooled Postgres URL                            | pooled Postgres URL                 |
| `DIRECT_URL`                               | same as above           | unpooled URL (migrations)                      | unpooled URL                        |
| `SITE_URL`                                 | `http://localhost:3001` | optional (falls back to `https://$VERCEL_URL`) | **required**, `https://`            |
| `VOUCHER_ENCRYPTION_KEY`                   | optional (dev fallback) | **required** 64 hex                            | **required**, from a secret manager |
| `PAYMENT_WEBHOOK_SECRET`                   | optional                | **required**                                   | real gateway's secret               |
| `CRON_SECRET`                              | optional                | **required**                                   | **required**                        |
| `PAYMENT_GATEWAY`                          | `demo`                  | `demo`                                         | real adapter code (demo refused)    |
| `GIFT_CARD_PROVIDER`                       | `DEMO`                  | `DEMO`                                         | real provider code (DEMO refused)   |
| `EMAIL_PROVIDER`                           | `demo`                  | `demo`                                         | real provider (demo refused)        |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | for `db:seed`           | for seeding                                    | not used                            |
| `COMPANY_*`, `SUPPORT_*`, `GRIEVANCE_*`    | optional                | optional                                       | **set real values**                 |

Secret fallbacks exist **only** for local dev (`NODE_ENV≠production` and `APP_MODE=demo`). `instrumentation.ts` runs `assertSafeConfig()` at server start, so an unsafe live configuration refuses to boot.

## Demo mode vs live mode

**Demo:** the simulated gateway, provider and email are allowed. Every page shows a "Demo environment" banner, vouchers are `TEST-…` and labelled _Test voucher · not redeemable_, the site is `noindex`, and `/demo/emails` and `/admin/demo-lab` exist.

**Live:** demo adapters throw, the demo lab and inbox return 404, and secrets plus an https `SITE_URL` are required. Live currently can't start because no real adapters exist yet. That's intentional.

## Demo payment gateway ("DemoPay")

Checkout redirects to `/pay/demo/[id]`, a hosted payment page standing in for the real gateway's. Each button produces a signed webhook plus a signed return redirect, exactly like a real gateway:

| Scenario                         | What happens                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment succeeds                 | Captured; webhook + return → PAID → fulfilment                                                                                              |
| Payment fails / Customer cancels | PAYMENT_FAILED / CANCELLED; "Try again" creates a new attempt                                                                               |
| Pending → succeeds / fails       | Settles after ~20s; found by status polling (status page or cron)                                                                           |
| Duplicate webhook                | Same event delivered twice → processed once                                                                                                 |
| Wrong amount captured            | ₹1 short → never fulfilled, MANUAL_REVIEW + CRITICAL issue                                                                                  |
| Late success                     | Reported failed, captured ~20s later with no webhook → polling funds the order                                                              |
| Double capture                   | Attempt 1 "fails", customer retries and pays, then attempt 1 also captures → one fulfilment; the extra payment is flagged and auto-refunded |

The return redirect is never trusted on its own. It only identifies the payment, and the outcome is confirmed server-to-server with `getPaymentStatus`.

## Demo gift-card provider ("DemoCards")

A persistent simulated supplier with its own catalogue, orders, issued cards (encrypted), a prefunded balance (₹10,00,000) and debits. It honours **our `providerReference` as an idempotency key**: re-sending a reference returns the original order instead of creating a new one. Codes look like `TEST-AMAZONPAY-7K2Q-9XMD`.

Demo economics, for example Amazon Pay ₹1,000: face ₹1,000 · demo cost ₹975 · customer pays ₹990 · saves ₹10 · demo margin ₹15. These are **simulated numbers, not any distributor's rates**.

Scenarios (set from the demo lab):

| Scenario                    | Expected handling                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Success                     | Vouchers stored, one debit                                                                                |
| Definitive failure          | FULFILMENT_FAILED → REFUND_PENDING → REFUNDED                                                             |
| Timeout before issue        | Lookup NOT_FOUND → re-send the **same** reference → one voucher                                           |
| **Timeout after issue**     | Provider issued but the reply is lost → **no new order**, lookup finds it → one voucher, one debit        |
| Pending → success / failure | FULFILMENT_PENDING, re-checked → FULFILLED / refunded                                                     |
| Malformed response          | Treated as ambiguous → lookup recovers                                                                    |
| Partial fulfilment          | Fewer cards than ordered (qty > 1) → MANUAL_REVIEW                                                        |
| Provider down (60s)         | Calls fail → FULFILMENT_PENDING → completes when it's back                                                |
| Insufficient balance        | MANUAL_REVIEW (no blind retry); admin "Retry fulfilment" after top-up                                     |
| Non-idempotent mode         | The provider duplicates on re-send → our service never re-sends after an ambiguous result → MANUAL_REVIEW |

## Demo email

`EMAIL_PROVIDER=demo` writes to the `DemoEmail` outbox, and nothing is logged except metadata. View it at **`/demo/emails`**: admins see everything, customers see emails addressed to themselves. Templates cover welcome/verify, verify, password reset, payment received, gift card ready (a link, never the code), delay, refund initiated and refund completed.

### Real email via Brevo (free, no domain needed)

1. Create a free account at brevo.com.
2. **Senders, domains & dedicated IPs → Senders → Add a sender** with an address you own (e.g. your Gmail), and confirm the email Brevo sends you.
3. **SMTP & API → API keys → Generate** a key.
4. Set `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `EMAIL_FROM` (the verified sender) and optionally `EMAIL_FROM_NAME`, then redeploy.

Without your own domain, emails may land in spam. Once you have a domain, authenticate it in Brevo (DNS records) and switch `EMAIL_FROM` to e.g. `noreply@gifts19.com`. In demo mode every email is also copied to `/demo/emails`.

## Admin

Create an admin with `pnpm admin:create` (`ADMIN_EMAIL`, `ADMIN_PASSWORD` env vars), or via `DEMO_ADMIN_*` + `pnpm db:seed` in demo mode. Roles are `CUSTOMER`, `SUPPORT` (read-only console) and `ADMIN`.

`/admin` has:

- a dashboard: orders/captures today, fulfilment and refund counts, open issues, provider balance, and a "Run processor now" button;
- order search: by id, email, order status, payment status or date;
- order detail: face, selling price, cost, margin, payment attempts and events, fulfilment attempts with provider references, vouchers (last 4 only), refunds, ledger, audit timeline and issues;
- a catalogue page: sync, enable/disable a brand or product, set the brand discount;
- reconciliation and users (block/unblock).

Safe actions: check payment status, check provider status (lookup only), retry fulfilment (**only** when the provider has confirmed nothing was issued), initiate an eligible refund, and move to manual review. **There is no "issue voucher again" button.**

## Demo lab

`/admin/demo-lab` (admin, demo mode only) controls the simulated systems:

- the next provider scenario (one-shot or sticky);
- provider idempotency on/off;
- provider down/up;
- provider balance;
- an armed payment scenario;
- "fail next refund";
- supplier catalogue changes: add a denomination, change availability or cost, take a brand out of stock, change terms. Then press **Catalogue → Sync**.

## Database migrations

Prisma Migrate (`prisma/migrations`): `pnpm db:migrate` in development, `pnpm db:deploy` in deployed environments (Vercel runs it in `vercel-build`). `LedgerEntry` has a DB trigger rejecting UPDATE/DELETE.

`pnpm db:seed` is **non-destructive**. `pnpm db:reset-demo --confirm <dbname>` wipes a demo database. It requires `APP_MODE=demo`, the matching database name, and `ALLOW_DEMO_RESET=true` on deployed environments.

## Tests

```sh
pnpm test        # 68 integration tests against real Postgres (auto-starts one if needed)
pnpm test:e2e    # 26 HTTP end-to-end scenarios against a running server (pnpm build && pnpm start)
```

Unit and integration tests (`tests/`) cover:

- money;
- the state machine, including a guard that fails if any code outside `lib/orders/state.ts` writes `Order.status`;
- checkout idempotency and limits;
- every payment scenario;
- every fulfilment scenario, including crash recovery and concurrent processors;
- refunds and the ledger trigger;
- catalogue sync;
- reconciliation;
- voucher ownership and log leakage;
- auth.

## Vercel deployment

1. Create a Postgres database (Neon, Supabase, Vercel Marketplace…). Copy a **pooled** URL to `DATABASE_URL` and a **direct** URL to `DIRECT_URL`.
2. Import the repo into Vercel (framework: Next.js; `vercel.json` sets `buildCommand: pnpm vercel-build`, which runs `prisma generate && prisma migrate deploy && next build`).
3. Set env vars for the environment: `APP_MODE=demo`, `DATABASE_URL`, `DIRECT_URL`, `VOUCHER_ENCRYPTION_KEY`, `PAYMENT_WEBHOOK_SECRET`, `CRON_SECRET`, `PAYMENT_GATEWAY=demo`, `GIFT_CARD_PROVIDER=DEMO`, `EMAIL_PROVIDER=demo`, `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD` (and `SITE_URL` once you have a stable domain).
4. Deploy. Then seed once from your machine against the same database:
   `DATABASE_URL=… DIRECT_URL=… APP_MODE=demo DEMO_ADMIN_EMAIL=… DEMO_ADMIN_PASSWORD=… pnpm db:seed`
5. Check `https://<deployment>/api/health` returns `{"status":"ok"}`.

### Cron jobs

`vercel.json` schedules `/api/internal/cron/process` and `/api/internal/cron/reconcile` **daily**, which is what the Hobby plan allows. Fulfilment does not depend on cron: a verified payment triggers it immediately via `after()`, and the order status page nudges pending work every few seconds. Cron is the recovery net. On Vercel Pro, change the schedules to `* * * * *` and `*/15 * * * *`. Both endpoints require `Authorization: Bearer $CRON_SECRET` (Vercel adds it), process small time-boxed batches (`maxDuration = 60`), and are safe to run concurrently.

## Security model

- **Passwords:** async scrypt hashes. **Sessions:** random token in an httpOnly cookie, only its SHA-256 stored. **Email verification** is required before buying.
- **Login:** lockout after 5 failures. **Rate limits** are DB-backed (works across Vercel instances) and keyed on the trusted client IP (`x-real-ip` on Vercel; `X-Forwarded-For` only with `TRUST_PROXY_HEADERS=true`).
- **Voucher codes/PINs:** AES-256-GCM encrypted, one row per voucher, never in page HTML until the owner clicks Reveal (ownership-checked, rate-limited, audited), never logged, never emailed.
- **Webhooks:** HMAC with timestamp tolerance; each event id processed once. **Return redirects:** signed, then confirmed server-to-server.
- **Links and redirects:** reset/verify links and gateway return URLs use `SITE_URL`, never request Host headers.
- **Logs:** structured JSON with recursive redaction of secret-looking keys; no email bodies.
- **Headers:** frame-deny, nosniff, referrer policy, HSTS in production, and `no-store` on account/order/admin pages. **CSRF:** Next.js server actions check Origin; routes are signature- or bearer-protected.
- **Ownership checks** on every order, payment, voucher and admin action. Admin pages return 404 to non-staff.

## Order state machine

Defined, with allowed transitions, in [`lib/orders/state.ts`](lib/orders/state.ts):

```
PAYMENT_PENDING ─verified capture─▶ PAID ─claim─▶ FULFILLING ─▶ FULFILLED
  ├─▶ PAYMENT_FAILED ─retry─▶ PAYMENT_PENDING   (late capture ─▶ PAID)
  └─▶ CANCELLED      ─retry─▶ PAYMENT_PENDING   (late capture ─▶ PAID)
FULFILLING ─▶ FULFILMENT_PENDING (provider pending / ambiguous → lookup later) ─▶ FULFILLING
FULFILLING ─▶ FULFILMENT_FAILED ─▶ REFUND_PENDING ─▶ REFUNDED
any risky state ─▶ MANUAL_REVIEW ─▶ REFUND_PENDING | PAID (safe retry) | FULFILLED (lookup recovered)
```

Every write is a conditional UPDATE on the expected current state and is audited.

## Payment flow

1. Checkout creates the order (unique per user + `checkoutKey`) and a `Payment` row whose id is the gateway's idempotency key.
2. Redirect to the gateway.
3. Signed webhook → `PaymentEvent` (unique per gateway event id) → `PaymentService.applyGatewayState`.
4. A capture is accepted only if the gateway id, merchant reference, **amount and currency** all match. Capture, ledger entry and the PAID transition happen in one transaction.
5. The first verified capture funds the order (`Order.capturedPaymentId` is unique). Any later capture is an extra capture and is refunded.

## Fulfilment flow

1. A processor claims the order with a lease.
2. It **commits** a `FulfilmentAttempt` (our unique `providerReference`, `placeCalls++`) **before** calling the provider, never inside a transaction.
3. On a result: ISSUED → vouchers stored (unique per attempt/unit and per provider voucher ref) plus a provider-cost ledger entry; PENDING → re-check later; FAILED → refund.
4. On timeout, malformed reply or provider down → **status lookup by reference, never a new order.** Found → recover. NOT_FOUND → re-send the same reference only if the provider is idempotent, otherwise MANUAL_REVIEW.

## Failure recovery

- **Processor crash:** the lease expires and the next run takes over. Attempt rows show whether a call might have happened (`placeCalls > 0` → lookup first).
- **Captured but the webhook was missed:** payment polling and reconciliation apply it through the same idempotent path.
- **Stuck orders and discrepancies:** recorded as `ReconciliationIssue`s for humans, never silently "fixed".

## How to add a real payment gateway

Create `lib/payments/gateways/<name>.ts` implementing `PaymentGateway` (createPayment, getPaymentStatus, verifyReturn, parseWebhook, refund, getRefundStatus). Map statuses and amounts (paise), verify signatures with the gateway's scheme, register it in `lib/payments/gateways/index.ts`, set `PAYMENT_GATEWAY`. Webhook URL: `/api/payments/webhook/<code>`; return URL: `/payment/return/<code>`. Nothing in checkout, orders, fulfilment, the UI or admin changes.

## How to add a real gift-card provider

Create `lib/fulfilment/providers/<name>.ts` implementing `GiftCardProvider`: capabilities, catalogue mapping, `placeOrder` with our `providerReference`, `getOrderStatus(providerReference)`, optional balance and order listing. It must throw `ProviderError` when an outcome is unknown and return `FAILED` only when the provider definitively issued nothing. Register it in `lib/fulfilment/providers/index.ts`, set `GIFT_CARD_PROVIDER`, run catalogue sync.

## Pine Labs integration placeholder

Not implemented. After onboarding and **official documentation**, add `PineLabsGiftCardProvider` as described above. Its only jobs are authentication, request/response mapping, error mapping, status lookup and catalogue mapping. Checkout, payments, pricing, refunds, order states, the UI, admin, the ledger and reconciliation stay as they are. Open questions to settle with Pine Labs first: idempotency on client references, status lookup by reference, sync vs. async issuance, callbacks, voucher fields, rate limits, IP allow-listing, settlement and prefunding, B2C resale rights per brand (e.g. Amazon Pay, Flipkart).

## Brand assets

Logos in `public/logos/` are for internal demo use only. **Production usage rights must be confirmed** with each brand or the distributor. Their presence doesn't imply endorsement.
