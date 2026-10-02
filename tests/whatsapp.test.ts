import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyCustomer } from "@/lib/notifications";
import { renderWhatsAppText } from "@/lib/notifications/whatsapp";
import { normalizePhone } from "@/lib/phone";
import { resetDb } from "./helpers";

describe("phone numbers", () => {
  it("normalises Indian and international formats", () => {
    expect(normalizePhone("98765 43210")).toBe("919876543210");
    expect(normalizePhone("09876543210")).toBe("919876543210");
    expect(normalizePhone("+91 98765-43210")).toBe("919876543210");
    expect(normalizePhone("919876543210")).toBe("919876543210");
    expect(normalizePhone("+1 415 555 0123")).toBe("14155550123");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull(); // Indian mobiles start 6–9
    expect(normalizePhone("+91 98765")).toBeNull();
  });
});

describe("WhatsApp notifications", () => {
  const customer = {
    name: "Asha Rao",
    email: "asha@example.org",
    phone: "919876543210",
    whatsappOptIn: true,
  };

  beforeEach(async () => {
    await resetDb();
    Object.assign(process.env, {
      WHATSAPP_PROVIDER: "meta",
      WHATSAPP_ACCESS_TOKEN: "wa-token",
      WHATSAPP_PHONE_NUMBER_ID: "1234567890",
      WHATSAPP_MESSAGE_MODE: "template",
    });
  });
  afterEach(() => {
    process.env.WHATSAPP_PROVIDER = "off";
    vi.unstubAllGlobals();
  });

  function stubFetch(status = 200) {
    const fn = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(
            status === 200
              ? { messages: [{ id: "wamid.1" }] }
              : { error: { code: 131047 } },
          ),
          { status },
        ),
      );
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("sends an approved template with the order details and a link (never a code)", async () => {
    const fetchMock = stubFetch();
    await notifyCustomer("GIFT_CARD_READY", customer, { orderId: "GC-ABC123" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v23.0/1234567890/messages");
    expect(init.headers.authorization).toBe("Bearer wa-token");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      to: "919876543210",
      type: "template",
    });
    expect(body.template.name).toBe("gifts19_gift_card_ready");
    expect(
      body.template.components[0].parameters.map(
        (p: { text: string }) => p.text,
      ),
    ).toEqual(["Asha", "GC-ABC123", "http://localhost:3001/orders/GC-ABC123"]);
  });

  it("text mode sends the filled-in message body", async () => {
    process.env.WHATSAPP_MESSAGE_MODE = "text";
    const fetchMock = stubFetch();
    await notifyCustomer("REFUND_INITIATED", customer, {
      orderId: "GC-ABC123",
      amountPaise: 99000,
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.type).toBe("text");
    expect(body.text.body).toBe(
      renderWhatsAppText("REFUND_INITIATED", {
        name: "Asha Rao",
        orderId: "GC-ABC123",
        amountPaise: 99000,
      }),
    );
    expect(body.text.body).toContain("₹990");
  });

  it("respects opt-in, missing numbers, email-only events and the provider switch", async () => {
    const fetchMock = stubFetch();
    await notifyCustomer(
      "GIFT_CARD_READY",
      { ...customer, whatsappOptIn: false },
      { orderId: "GC-1" },
    );
    await notifyCustomer(
      "GIFT_CARD_READY",
      { ...customer, phone: null },
      { orderId: "GC-1" },
    );
    await notifyCustomer("PASSWORD_RESET", customer, { link: "https://x" });
    process.env.WHATSAPP_PROVIDER = "off";
    await notifyCustomer("GIFT_CARD_READY", customer, { orderId: "GC-1" });
    // Only Brevo/email-free path ran: demo email provider writes to DB, no fetch.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a WhatsApp failure doesn't fail the notification or leak the message", async () => {
    stubFetch(400);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "info";
    try {
      expect(
        await notifyCustomer("SUPPORT_REPLY", customer, { ticketId: "TKT-1" }),
      ).toBe(true); // email still sent
      const logged = err.mock.calls.flat().join("\n");
      expect(logged).toContain("whatsapp.failed");
      expect(logged).toContain("131047");
      expect(logged).not.toContain("919876543210");
      expect(logged).not.toContain("support team replied");
    } finally {
      process.env.LOG_LEVEL = "silent";
      err.mockRestore();
    }
  });
});
