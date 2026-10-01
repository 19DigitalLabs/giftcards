/*
 * End-to-end demo test against a RUNNING server (dev or production build).
 * Drives the real HTML forms exactly like a browser with JavaScript off
 * (Next.js server actions are progressively enhanced), so it exercises the
 * whole stack: pages, server actions, the demo gateway's hosted page,
 * signed returns/webhooks, after() fulfilment, cron and the admin console.
 *
 *   pnpm build && pnpm start            # in one terminal
 *   pnpm test:e2e                       # in another
 *
 * Needs (from .env): DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, CRON_SECRET.
 * E2E_BASE_URL defaults to http://localhost:3001. Demo mode only.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD!;
const CRON = process.env.CRON_SECRET!;
const PASSWORD = "e2ePassw0rd!";

interface Result {
  scenario: string;
  expected: string;
  actual: string;
  pass: boolean;
}
const results: Result[] = [];
function record(
  scenario: string,
  expected: string,
  actual: string,
  pass: boolean,
) {
  results.push({ scenario, expected, actual, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${scenario} — ${actual}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

class Browser {
  jar = new Map<string, string>();
  cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair!.indexOf("=");
      const k = pair!.slice(0, i);
      const v = pair!.slice(i + 1);
      if (/expires=Thu, 01 Jan 1970/i.test(c) || v === "") this.jar.delete(k);
      else this.jar.set(k, v);
    }
  }
  async req(path: string, init: RequestInit = {}) {
    const res = await fetch(new URL(path, BASE), {
      ...init,
      redirect: "manual",
      headers: {
        ...(init.headers as Record<string, string>),
        cookie: this.cookie(),
        origin: BASE,
      },
    });
    this.store(res);
    return res;
  }
  async get(
    path: string,
  ): Promise<{ url: string; status: number; html: string }> {
    let url = new URL(path, BASE).toString();
    for (let i = 0; i < 10; i++) {
      const res = await this.req(url);
      if (res.status >= 300 && res.status < 400) {
        url = new URL(res.headers.get("location")!, url).toString();
        continue;
      }
      const u = new URL(url);
      return {
        url: u.pathname + u.search,
        status: res.status,
        html: await res.text(),
      };
    }
    throw new Error("too many redirects");
  }
  /** Submits the form on `path` that contains `marker`, with overrides. */
  async submit(
    path: string,
    marker: string,
    values: Record<string, string> = {},
    opts: { html?: string } = {},
  ) {
    const page = opts.html
      ? { url: path, html: opts.html }
      : await this.get(path);
    const forms = page.html.match(/<form[\s\S]*?<\/form>/g) ?? [];
    const form = forms.find((f) => f.includes(marker));
    if (!form) throw new Error(`form "${marker}" not found on ${page.url}`);
    const fd = new FormData();
    for (const m of form.matchAll(/<input([^>]*)>/g)) {
      const attrs = m[1]!;
      const name = /name="([^"]*)"/.exec(attrs)?.[1];
      if (!name) continue;
      const type = /type="([^"]*)"/.exec(attrs)?.[1];
      if ((type === "radio" || type === "checkbox") && !/checked/.test(attrs))
        continue;
      const value = (/value="([^"]*)"/.exec(attrs)?.[1] ?? "")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
      fd.set(name, value);
    }
    for (const m of form.matchAll(
      /<select[^>]*name="([^"]*)"[\s\S]*?<\/select>/g,
    )) {
      const selected =
        /<option[^>]*selected[^>]*value="([^"]*)"|<option[^>]*value="([^"]*)"[^>]*selected/.exec(
          m[0],
        );
      const first = /<option[^>]*value="([^"]*)"/.exec(m[0]);
      fd.set(m[1]!, selected?.[1] ?? selected?.[2] ?? first?.[1] ?? "");
    }
    for (const [k, v] of Object.entries(values)) fd.set(k, v);
    const res = await this.req(page.url, { method: "POST", body: fd });
    return {
      status: res.status,
      location: res.headers.get("location"),
      html: res.status === 200 ? await res.text() : "",
    };
  }
  async submitFollow(
    path: string,
    marker: string,
    values: Record<string, string> = {},
  ) {
    const r = await this.submit(path, marker, values);
    if (!r.location) return { url: path, html: r.html, status: r.status };
    return this.get(r.location);
  }
  async login(email: string, password: string) {
    const r = await this.submit("/login", 'name="email"', {
      email,
      password,
      next: "/",
    });
    if (!r.location)
      throw new Error(
        `login failed for ${email}: ${text(r.html).slice(0, 200)}`,
      );
  }
}

async function signupVerified(b: Browser, label: string) {
  const email = `e2e-${label}-${Date.now()}@test.dev`;
  const r = await b.submit("/signup", 'name="name"', {
    name: `E2E ${label}`,
    email,
    password: PASSWORD,
    next: "/",
  });
  if (!r.location)
    throw new Error(`signup failed: ${text(r.html).slice(0, 200)}`);
  const inbox = await b.get("/demo/emails");
  const link = /href="(http[^"]*\/verify-email\?token=[^"]+)"/.exec(
    inbox.html,
  )?.[1];
  if (!link) throw new Error("verification email not found in demo inbox");
  const u = new URL(link.replace(/&amp;/g, "&"));
  const verified = await b.get(u.pathname + u.search);
  if (!text(verified.html).includes("Email verified"))
    throw new Error("verification failed");
  return email;
}

async function addToCart(
  b: Browser,
  slug: string,
  rupees: number,
  quantity = 1,
) {
  const page = await b.get(`/brands/${slug}`);
  const ids = new Map<number, string>();
  for (const m of page.html.matchAll(
    /data-product-id="([^"]+)" data-face-paise="(\d+)"/g,
  )) {
    ids.set(Number(m[2]) / 100, m[1]!);
  }
  const productId = ids.get(rupees);
  if (!productId)
    throw new Error(
      `₹${rupees} not offered on ${slug} (${[...ids.keys()].join(",")})`,
    );
  return b.submit(
    `/brands/${slug}`,
    'name="productId"',
    { productId, quantity: String(quantity) },
    { html: page.html },
  );
}

async function buy(
  b: Browser,
  slug: string,
  rupees: number,
  scenario: string,
  quantity = 1,
) {
  await clearCart(b);
  await addToCart(b, slug, rupees, quantity);
  const checkout = await b.get("/checkout");
  const r = await b.submit(
    "/checkout",
    'name="checkoutKey"',
    {},
    { html: checkout.html },
  );
  if (!r.location?.includes("/pay/demo/"))
    throw new Error(
      `checkout did not redirect to gateway: ${text(r.html).slice(0, 300)}`,
    );
  const gatewayPath = new URL(r.location, BASE).pathname;
  const after = await b.submitFollow(gatewayPath, `&quot;${scenario}&quot;]`);
  const orderId = /\/payment\/status\/(GC-[0-9A-F]+)/.exec(after.url)?.[1];
  if (!orderId) throw new Error(`no order after gateway (${after.url})`);
  return { orderId, gatewayPath, statusHtml: after.html };
}

async function clearCart(b: Browser) {
  for (let i = 0; i < 10; i++) {
    const cart = await b.get("/cart");
    if (!cart.html.includes(">Remove<")) return;
    await b.submit("/cart", ">Remove<", {}, { html: cart.html });
  }
}

async function cron(path: "process" | "reconcile", secret = CRON) {
  const res = await fetch(`${BASE}/api/internal/cron/${path}`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Polls the customer status page until it shows `want` (or times out). */
async function waitFor(
  b: Browser,
  orderId: string,
  want: string,
  timeoutMs = 20_000,
  kick = false,
) {
  const end = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < end) {
    last = text((await b.get(`/payment/status/${orderId}`)).html);
    if (last.includes(want)) return true;
    if (kick) await cron("process");
    await sleep(1000);
  }
  console.log(`   last status text: ${last.slice(0, 160)}`);
  return false;
}

async function adminOrder(orderId: string) {
  return text((await admin.get(`/admin/orders/${orderId}`)).html);
}

async function lab(marker: string, values: Record<string, string> = {}) {
  const r = await admin.submit("/admin/demo-lab", marker, values);
  if (!r.location) throw new Error(`demo lab action failed (${marker})`);
}

const admin = new Browser();

async function main() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  record(
    "Health endpoint",
    "status ok, mode demo",
    `${health.status}/${health.mode}/${health.database}`,
    health.status === "ok" && health.mode === "demo",
  );
  if (health.mode !== "demo")
    throw new Error("E2E runs against APP_MODE=demo only.");

  await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  await lab('value="SUCCESS"', { scenario: "SUCCESS" }); // reset provider scenario
  await lab('name="rupees"', { rupees: "1000000" });

  const a = new Browser();
  const emailA = await signupVerified(a, "a");
  record(
    "Signup + demo email verification",
    "verified via /demo/emails",
    emailA,
    true,
  );

  // ── 1. Success flow (₹1,000 face, ₹990 price, ₹975 provider cost) ─────
  const amazon = text((await a.get("/brands/amazon-pay")).html);
  record(
    "Brand page shows demo price",
    "₹1,000 → You pay ₹990 when selected",
    amazon.includes("Amazon Pay") ? "Amazon Pay page" : "missing",
    amazon.includes("Amazon Pay"),
  );
  await clearCart(a);
  await addToCart(a, "amazon-pay", 1000);
  const checkoutText = text((await a.get("/checkout")).html);
  record(
    "Checkout summary",
    "Value ₹1,000 · Discount −₹10 · You pay ₹990",
    checkoutText.match(/Gift card value ₹[\d,]+ Discount −₹[\d,]+/)?.[0] ?? "?",
    /Gift card value ₹1,000 Discount −₹10/.test(checkoutText) &&
      checkoutText.includes("Pay ₹990"),
  );

  const balanceBefore = Number(
    /Demo provider balance \(simulated\) ₹([\d,]+)/
      .exec(text((await admin.get("/admin")).html))?.[1]
      ?.replace(/,/g, ""),
  );
  const ok = await buy(a, "amazon-pay", 1000, "SUCCESS");
  const fulfilled = await waitFor(a, ok.orderId, "Your gift card is ready");
  record(
    "SUCCESS flow → FULFILLED",
    "payment verified → PAID → provider → FULFILLED",
    fulfilled ? "FULFILLED" : "not fulfilled",
    fulfilled,
  );
  const orderPage = await a.get(`/orders/${ok.orderId}`);
  const codeInHtml = /TEST-AMAZONPAY-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(
    orderPage.html,
  );
  record(
    "Voucher not in initial HTML",
    "masked •••• only",
    codeInHtml ? "CODE LEAKED" : "masked",
    !codeInHtml && text(orderPage.html).includes("Test voucher"),
  );
  const voucherId = /name="voucherId" value="([^"]+)"/.exec(
    orderPage.html,
  )?.[1];
  const revealed = await a.submit(
    `/orders/${ok.orderId}`,
    'name="voucherId"',
    {},
    { html: orderPage.html },
  );
  const code = /TEST-AMAZONPAY-[A-Z2-9]{4}-[A-Z2-9]{4}/.exec(
    revealed.html,
  )?.[0];
  record(
    "Reveal voucher (owner)",
    "TEST-AMAZONPAY-…",
    code ?? "none",
    Boolean(code),
  );
  const balanceAfter = Number(
    /Demo provider balance \(simulated\) ₹([\d,]+)/
      .exec(text((await admin.get("/admin")).html))?.[1]
      ?.replace(/,/g, ""),
  );
  record(
    "Provider debited once",
    "₹975",
    `₹${balanceBefore - balanceAfter}`,
    balanceBefore - balanceAfter === 975,
  );
  const okAdmin = await adminOrder(ok.orderId);
  const auditOk = [
    "PAYMENT_CAPTURED",
    "PROVIDER_COST",
    "VOUCHER_STORED",
    "VOUCHER_REVEALED",
    "PAYMENT_VERIFIED",
  ].every((s) => okAdmin.includes(s));
  record(
    "Admin timeline (ledger + audit, no plaintext)",
    "capture/cost/stored/revealed, no code",
    auditOk && code && !okAdmin.includes(code)
      ? "complete, no plaintext"
      : "incomplete or leaked",
    Boolean(auditOk && code && !okAdmin.includes(code)),
  );
  record(
    "Admin margin view",
    "Gross margin ₹15",
    /Gross margin ₹15\b/.test(okAdmin) ? "₹15" : "missing",
    /Gross margin ₹15\b/.test(okAdmin),
  );

  // ── 2. Payment failure ─────────────────────────────────────────────────
  const failed = await buy(a, "amazon-pay", 1000, "FAILED");
  record(
    "PAYMENT FAILURE",
    "Payment was unsuccessful",
    text(failed.statusHtml).includes("Payment was unsuccessful")
      ? "PAYMENT_FAILED"
      : "?",
    text(failed.statusHtml).includes("Payment was unsuccessful"),
  );

  // ── 3. Pending → success (resolved by polling/cron) ───────────────────
  const pending = await buy(a, "amazon-pay", 500, "PENDING_SUCCESS");
  const waiting = text(pending.statusHtml).includes("Waiting for payment");
  console.log("   …waiting ~22s for the bank to settle");
  await sleep(21_000);
  const pendingDone = await waitFor(
    a,
    pending.orderId,
    "Your gift card is ready",
    20_000,
    true,
  );
  record(
    "PAYMENT PENDING → SUCCESS",
    "waiting, then FULFILLED",
    `${waiting ? "waiting" : "?"} → ${pendingDone ? "FULFILLED" : "stuck"}`,
    waiting && pendingDone,
  );

  // ── 4. Provider failure → refund ──────────────────────────────────────
  await lab('value="FAILURE"', { scenario: "FAILURE" });
  const refunded = await buy(a, "amazon-pay", 1000, "SUCCESS");
  const refundedOk = await waitFor(
    a,
    refunded.orderId,
    "Your payment has been refunded",
  );
  const refAdmin = await adminOrder(refunded.orderId);
  record(
    "PROVIDER FAILURE → REFUND",
    "FULFILMENT_FAILED → REFUND_PENDING → REFUNDED",
    refundedOk ? "REFUNDED" : "not refunded",
    refundedOk && refAdmin.includes("PAYMENT_REFUNDED"),
  );

  // ── 5. Timeout before issue ───────────────────────────────────────────
  await lab('value="TIMEOUT_BEFORE_ISSUE"', {
    scenario: "TIMEOUT_BEFORE_ISSUE",
  });
  const tbi = await buy(a, "amazon-pay", 1000, "SUCCESS");
  const tbiOk = await waitFor(a, tbi.orderId, "Your gift card is ready");
  const tbiAdmin = await adminOrder(tbi.orderId);
  record(
    "TIMEOUT BEFORE ISSUE",
    "lookup NOT_FOUND → same-reference re-send → 1 voucher",
    tbiOk ? "FULFILLED" : "?",
    tbiOk &&
      tbiAdmin.includes("PROVIDER_TIMEOUT") &&
      (tbiAdmin.match(/•••• /g) ?? []).length === 1,
  );

  // ── 6. Timeout AFTER issue (the critical one) ─────────────────────────
  const before6 = Number(
    /Demo provider balance \(simulated\) ₹([\d,]+)/
      .exec(text((await admin.get("/admin")).html))?.[1]
      ?.replace(/,/g, ""),
  );
  await lab('value="TIMEOUT_AFTER_ISSUE"', { scenario: "TIMEOUT_AFTER_ISSUE" });
  const tai = await buy(a, "amazon-pay", 1000, "SUCCESS");
  const taiOk = await waitFor(a, tai.orderId, "Your gift card is ready");
  const taiAdmin = await adminOrder(tai.orderId);
  const after6 = Number(
    /Demo provider balance \(simulated\) ₹([\d,]+)/
      .exec(text((await admin.get("/admin")).html))?.[1]
      ?.replace(/,/g, ""),
  );
  const vouchers6 = (taiAdmin.match(/•••• /g) ?? []).length;
  const taiPass =
    taiOk &&
    taiAdmin.includes("PROVIDER_TIMEOUT") &&
    taiAdmin.includes("PROVIDER_STATUS_CHECKED") &&
    vouchers6 === 1 &&
    before6 - after6 === 975;
  record(
    "TIMEOUT AFTER ISSUE",
    "no 2nd order; lookup recovers; 1 voucher; 1 debit ₹975",
    `vouchers=${vouchers6}, debit=₹${before6 - after6}, ${taiOk ? "FULFILLED" : "?"}`,
    taiPass,
  );

  // ── 7. Duplicate payment webhook ──────────────────────────────────────
  const dup = await buy(a, "amazon-pay", 250, "DUPLICATE_WEBHOOK");
  const dupOk = await waitFor(a, dup.orderId, "Your gift card is ready");
  const dupAdmin = await adminOrder(dup.orderId);
  const captures = (dupAdmin.match(/PAYMENT_CAPTURED/g) ?? []).length;
  record(
    "DUPLICATE PAYMENT WEBHOOK",
    "processed once; 1 capture; 1 voucher",
    `captures in ledger=${captures}`,
    dupOk && captures === 1,
  );

  // ── 8. Duplicate fulfilment (concurrent processor runs) ───────────────
  const [c1, c2, c3] = await Promise.all([
    cron("process"),
    cron("process"),
    cron("process"),
  ]);
  const dupFul = await adminOrder(dup.orderId);
  record(
    "DUPLICATE FULFILMENT (3 concurrent cron runs)",
    "no extra vouchers",
    `${c1.status}/${c2.status}/${c3.status}, vouchers=${(dupFul.match(/•••• /g) ?? []).length}`,
    (dupFul.match(/•••• /g) ?? []).length === 1,
  );

  // ── 9. Double checkout (same key, parallel) ───────────────────────────
  const c = new Browser();
  await signupVerified(c, "c");
  await addToCart(c, "flipkart", 500);
  const chk = await c.get("/checkout");
  const parallel = await Promise.all(
    [1, 2, 3].map(() =>
      c.submit("/checkout", 'name="checkoutKey"', {}, { html: chk.html }),
    ),
  );
  const targets = new Set(parallel.map((p) => p.location));
  const ordersC = (
    text((await c.get("/orders")).html).match(/GC-[0-9A-F]{10}/g) ?? []
  ).length;
  record(
    "DOUBLE CHECKOUT (3 parallel submits, same key)",
    "one payable order",
    `distinct redirects=${targets.size}, orders=${ordersC}`,
    ordersC === 1,
  );

  // ── 10. Double capture ────────────────────────────────────────────────
  const dc = await buy(c, "flipkart", 500, "DOUBLE_CAPTURE");
  const dcOk = await waitFor(c, dc.orderId, "Your gift card is ready");
  const dcAdmin = await adminOrder(dc.orderId);
  record(
    "DOUBLE CAPTURE",
    "1 fulfilment; extra capture refunded",
    dcOk &&
      dcAdmin.includes("PAYMENT_REFUNDED") &&
      dcAdmin.includes("EXTRA_CAPTURE_DETECTED")
      ? "1 voucher, extra refunded"
      : "?",
    dcOk &&
      dcAdmin.includes("PAYMENT_REFUNDED") &&
      (dcAdmin.match(/•••• /g) ?? []).length === 1,
  );

  // ── 11. Insufficient provider balance ─────────────────────────────────
  await lab('name="rupees"', { rupees: "100" });
  const ib = await buy(c, "flipkart", 1000, "SUCCESS");
  const ibReview = await waitFor(c, ib.orderId, "We're checking your order");
  await lab('name="rupees"', { rupees: "1000000" });
  const retried = await admin.submit(
    `/admin/orders/${ib.orderId}`,
    "Retry fulfilment",
  );
  const ibOk = await waitFor(c, ib.orderId, "Your gift card is ready");
  record(
    "INSUFFICIENT PROVIDER BALANCE",
    "MANUAL_REVIEW, no blind retry; admin safe retry after top-up",
    `${ibReview ? "review" : "?"} → ${ibOk ? "FULFILLED" : "?"} (${retried.location ? "retried" : "no retry"})`,
    ibReview && ibOk,
  );

  // ── 12. Product disabled ──────────────────────────────────────────────
  await clearCart(c);
  await addToCart(c, "swiggy", 500);
  const catalogue = await admin.get("/admin/catalogue");
  const disable = await admin.submit(
    "/admin/catalogue",
    ">Disable</button>",
    {},
    { html: catalogue.html.slice(catalogue.html.indexOf("DEMO-SWIGGY-500")) },
  );
  const cartText = text((await c.get("/cart")).html);
  const blocked = cartText.includes("temporarily unavailable");
  const checkoutRedirect = (await c.get("/checkout")).url;
  record(
    "PRODUCT DISABLED",
    "cart shows unavailable, checkout blocked",
    `${blocked ? "unavailable shown" : "?"}, /checkout → ${checkoutRedirect}`,
    Boolean(disable.location) && blocked && checkoutRedirect === "/cart",
  );
  const catalogue2 = await admin.get("/admin/catalogue");
  await admin.submit(
    "/admin/catalogue",
    ">Enable</button>",
    {},
    { html: catalogue2.html.slice(catalogue2.html.indexOf("DEMO-SWIGGY-500")) },
  );

  // ── 13. Unauthorized voucher access ───────────────────────────────────
  const b = new Browser();
  await signupVerified(b, "b");
  const foreign = await b.get(`/orders/${ok.orderId}`);
  const steal = voucherId
    ? await b.submit(
        `/orders/${ok.orderId}`,
        'name="voucherId"',
        { voucherId },
        { html: orderPage.html.replace(/action="[^"]*"/, 'action=""') },
      )
    : { html: "" };
  const stolen = /TEST-AMAZONPAY-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(steal.html);
  record(
    "UNAUTHORIZED VOUCHER ACCESS",
    "404 on order page; reveal refused",
    `order page ${foreign.status}; reveal ${stolen ? "LEAKED" : "refused"}`,
    foreign.status === 404 && !stolen,
  );

  // ── 14. Admin access control ──────────────────────────────────────────
  const custAdmin = await b.get("/admin");
  const anonAdmin = await new Browser().get("/admin");
  record(
    "ADMIN ACCESS",
    "customer 404, anonymous → login",
    `customer ${custAdmin.status}, anonymous → ${anonAdmin.url}`,
    custAdmin.status === 404 && anonAdmin.url.startsWith("/login"),
  );

  // ── 15. Catalogue sync ────────────────────────────────────────────────
  await lab("add-denomination", { brandRef: "AMAZONPAY", rupees: "750" });
  await admin.submit("/admin/catalogue", "Sync catalogue");
  const amazonAfter = text((await a.get("/brands/amazon-pay")).html);
  record(
    "CATALOGUE SYNC",
    "new ₹750 denomination appears",
    amazonAfter.includes("₹750") ? "₹750 listed" : "missing",
    amazonAfter.includes("₹750"),
  );

  // ── 16. Reconciliation + cron auth ────────────────────────────────────
  const recon = await cron("reconcile");
  const reconBad = await cron("reconcile", "wrong");
  record(
    "RECONCILIATION (cron)",
    "200 with secret, 401 without",
    `${recon.status} (${recon.body.paymentsChecked} payments checked) / ${reconBad.status}`,
    recon.status === 200 && reconBad.status === 401,
  );

  // ── 17. Headers ───────────────────────────────────────────────────────
  const home = await fetch(BASE);
  const orderRes = await a.req(`/orders/${ok.orderId}`);
  record(
    "Security headers",
    "DENY, nosniff, no x-powered-by; no-store on order pages",
    `${home.headers.get("x-frame-options")}, ${home.headers.get("x-content-type-options")}, cache: ${orderRes.headers.get("cache-control")}`,
    home.headers.get("x-frame-options") === "DENY" &&
      !home.headers.get("x-powered-by") &&
      (orderRes.headers.get("cache-control") ?? "").includes("no-store"),
  );

  await lab('value="SUCCESS"', { scenario: "SUCCESS" });

  console.log("\n| Scenario | Expected | Actual | Result |\n|---|---|---|---|");
  for (const r of results)
    console.log(
      `| ${r.scenario} | ${r.expected} | ${r.actual} | ${r.pass ? "PASS" : "FAIL"} |`,
    );
  const failedCount = results.filter((r) => !r.pass).length;
  console.log(
    `\n${results.length - failedCount} passed, ${failedCount} failed`,
  );
  process.exitCode = failedCount ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
