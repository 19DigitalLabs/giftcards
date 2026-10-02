import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addCustomerMessage,
  createTicket,
  getOwnTicket,
  staffReply,
} from "@/lib/support";
import { checkout, createUser, resetDb } from "./helpers";

describe("support tickets", () => {
  beforeEach(resetDb);

  it("customer raises a ticket about their own order; staff reply emails a link, not the message", async () => {
    const user = await createUser();
    const { orderId } = await checkout(user);
    const ticket = await createTicket(user, {
      category: "ORDER_NOT_RECEIVED",
      subject: "Paid but no card",
      orderId,
      message: "I paid ten minutes ago and see nothing yet.",
    });
    expect(ticket.id).toMatch(/^TKT-[0-9A-F]{6}$/);
    expect(ticket.orderId).toBe(orderId);

    const staff = await createUser({ role: "ADMIN" });
    await staffReply(
      staff.id,
      ticket.id,
      "Secret internal-looking reply text",
      "AWAITING_CUSTOMER",
    );
    const mail = await db.demoEmail.findFirstOrThrow({
      where: { to: user.email, template: "SUPPORT_REPLY" },
    });
    expect(mail.text).toContain(`/account/support/${ticket.id}`);
    expect(mail.text).not.toContain("Secret internal-looking reply text");

    await addCustomerMessage(
      user.id,
      ticket.id,
      "Thanks, that worked for me now.",
    );
    const full = await getOwnTicket(user.id, ticket.id);
    expect(full.status).toBe("OPEN");
    expect(full.messages.map((m) => m.author)).toEqual([
      "CUSTOMER",
      "STAFF",
      "CUSTOMER",
    ]);
  });

  it("another customer can't read, reply to, or attach someone else's order", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const { orderId } = await checkout(owner);
    const ticket = await createTicket(owner, {
      category: "OTHER",
      subject: "Hello there",
      message: "A perfectly normal question.",
    });
    await expect(getOwnTicket(intruder.id, ticket.id)).rejects.toThrow(
      /not found/,
    );
    await expect(
      addCustomerMessage(intruder.id, ticket.id, "Let me in please!!"),
    ).rejects.toThrow(/not found/);
    await expect(
      createTicket(intruder, {
        category: "OTHER",
        subject: "Steal",
        orderId,
        message: "This is not my order at all.",
      }),
    ).rejects.toThrow(/isn't on your account/);
  });

  it("validates input and blocks replies on closed tickets", async () => {
    const user = await createUser();
    await expect(
      createTicket(user, {
        category: "NOPE",
        subject: "Hi there",
        message: "Long enough message.",
      }),
    ).rejects.toThrow(/topic/);
    await expect(
      createTicket(user, {
        category: "OTHER",
        subject: "Hi there",
        message: "short",
      }),
    ).rejects.toThrow(/more detail/);
    const ticket = await createTicket(user, {
      category: "OTHER",
      subject: "Hi there",
      message: "Long enough message.",
    });
    const staff = await createUser({ role: "ADMIN" });
    await staffReply(staff.id, ticket.id, "", "CLOSED");
    await expect(
      addCustomerMessage(user.id, ticket.id, "Reopen this please now"),
    ).rejects.toThrow(/closed/);
  });
});
