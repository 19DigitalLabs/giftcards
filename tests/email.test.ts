import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { sendTemplateEmail } from "@/lib/email/service";
import { resetDb } from "./helpers";

describe("Brevo email provider", () => {
  beforeEach(async () => {
    await resetDb();
    Object.assign(process.env, {
      EMAIL_PROVIDER: "brevo",
      BREVO_API_KEY: "test-key",
      EMAIL_FROM: "sender@example.org",
      EMAIL_FROM_NAME: "Gifts19",
    });
  });
  afterEach(() => {
    process.env.EMAIL_PROVIDER = "demo";
    vi.unstubAllGlobals();
  });

  it("posts to Brevo's API and keeps a demo-inbox copy in demo mode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ messageId: "m1" }), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    expect(
      await sendTemplateEmail("PASSWORD_RESET", "family@example.org", {
        name: "Asha",
        link: "https://x/reset?token=abc",
      }),
    ).toBe(true);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("test-key");
    const body = JSON.parse(init.body);
    expect(body.sender).toEqual({
      email: "sender@example.org",
      name: "Gifts19",
    });
    expect(body.to).toEqual([{ email: "family@example.org" }]);
    expect(body.subject).toContain("Reset");
    expect(
      await db.demoEmail.count({ where: { to: "family@example.org" } }),
    ).toBe(1);
  });

  it("a Brevo failure is reported without leaking the email body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: "unauthorized" }), {
          status: 401,
        }),
      ),
    );
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "info";
    try {
      expect(
        await sendTemplateEmail("PASSWORD_RESET", "family@example.org", {
          link: "https://x/reset?token=SECRET123",
        }),
      ).toBe(false);
      const logged = err.mock.calls.flat().join("\n");
      expect(logged).toContain("email.failed");
      expect(logged).not.toContain("SECRET123");
    } finally {
      process.env.LOG_LEVEL = "silent";
      err.mockRestore();
    }
  });
});

describe("email templates", () => {
  it("renders branded HTML + text, escapes user input, and every template renders", async () => {
    const { renderEmail } = await import("@/lib/email/templates");
    const r = renderEmail("WELCOME_VERIFY", {
      name: '<img src=x onerror="alert(1)">',
      link: "https://gifts19.test/verify-email?token=abc",
    });
    expect(r.html).toContain("Gifts<span");
    expect(r.html).toContain("#d8ff3e"); // brand lime button
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).toContain("&lt;img src=x");
    expect(r.html).toContain("https://gifts19.test/verify-email?token=abc");
    expect(r.text).toContain("https://gifts19.test/verify-email?token=abc");

    const all = [
      "WELCOME_VERIFY",
      "VERIFY_EMAIL",
      "PASSWORD_RESET",
      "PAYMENT_RECEIVED",
      "GIFT_CARD_READY",
      "FULFILMENT_DELAYED",
      "REFUND_INITIATED",
      "REFUND_COMPLETED",
      "SUPPORT_TICKET_CREATED",
      "SUPPORT_REPLY",
    ] as const;
    for (const t of all) {
      const out = renderEmail(t, {
        name: "Asha",
        orderId: "GC-ABC",
        amountPaise: 99000,
        ticketId: "TKT-1",
        link: "https://x",
      });
      expect(out.subject.length).toBeGreaterThan(5);
      expect(out.html).toMatch(/^<!doctype html>/);
      expect(out.text).toContain("— Team Gifts19");
    }
  });
});
