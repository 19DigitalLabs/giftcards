import { randomBytes } from "node:crypto";
import type { SupportTicketStatus } from "@prisma/client";
import { z } from "zod";
import { audit } from "./audit";
import { db } from "./db";
import { sendTemplateEmail } from "./email/service";
import { notifyCustomer } from "./notifications";
import { NotFoundError, UserFacingError } from "./errors";
import { enforceRateLimit } from "./rate-limit";

/*
 * Customer support tickets. Customers can only see and reply to their own
 * tickets; staff replies notify the customer by email (link only — the
 * conversation is read in the account).
 */

export const TICKET_CATEGORIES = {
  ORDER_NOT_RECEIVED: "Gift card not received",
  CODE_NOT_WORKING: "Code doesn't work",
  PAYMENT: "Payment issue",
  REFUND: "Refund",
  ACCOUNT: "Account & login",
  OTHER: "Something else",
} as const;

export type TicketCategory = keyof typeof TICKET_CATEGORIES;

export const TICKET_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: "Open",
  AWAITING_CUSTOMER: "Awaiting your reply",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const categories = Object.keys(TICKET_CATEGORIES) as [
  TicketCategory,
  ...TicketCategory[],
];

const messageSchema = z
  .string()
  .trim()
  .min(
    10,
    "Please describe the issue in a little more detail (10+ characters).",
  )
  .max(2000, "Messages are limited to 2,000 characters.");

const ticketSchema = z.object({
  category: z.enum(categories, { message: "Pick a topic." }),
  subject: z
    .string()
    .trim()
    .min(4, "Add a short subject.")
    .max(120, "Keep the subject under 120 characters."),
  orderId: z.string().trim().max(20).optional(),
  message: messageSchema,
});

function newTicketId(): string {
  return `TKT-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input.";
}

export async function createTicket(
  user: { id: string; name: string; email: string },
  input: {
    category: unknown;
    subject: unknown;
    orderId?: unknown;
    message: unknown;
  },
) {
  const parsed = ticketSchema.safeParse({
    ...input,
    orderId:
      typeof input.orderId === "string" && input.orderId
        ? input.orderId
        : undefined,
  });
  if (!parsed.success)
    throw new UserFacingError(firstIssue(parsed.error), "VALIDATION");
  await enforceRateLimit(`ticket-create:${user.id}`, 5, 60 * 60 * 1000);

  const { category, subject, orderId, message } = parsed.data;
  if (orderId) {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    if (!order || order.userId !== user.id)
      throw new UserFacingError(
        "That order isn't on your account.",
        "BAD_ORDER",
      );
  }

  const ticket = await db.supportTicket.create({
    data: {
      id: newTicketId(),
      userId: user.id,
      orderId: orderId ?? null,
      category,
      subject,
      messages: {
        create: { author: "CUSTOMER", authorId: user.id, body: message },
      },
    },
  });
  await audit({
    action: "SUPPORT_TICKET_CREATED",
    entityType: "SupportTicket",
    entityId: ticket.id,
    orderId: ticket.orderId,
    actorType: "CUSTOMER",
    actorId: user.id,
    data: { category },
  });
  await sendTemplateEmail("SUPPORT_TICKET_CREATED", user.email, {
    name: user.name,
    ticketId: ticket.id,
  });
  return ticket;
}

export async function getOwnTicket(userId: string, ticketId: string) {
  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket || ticket.userId !== userId) throw new NotFoundError("Ticket");
  return ticket;
}

export async function addCustomerMessage(
  userId: string,
  ticketId: string,
  body: unknown,
) {
  const ticket = await getOwnTicket(userId, ticketId);
  if (ticket.status === "CLOSED")
    throw new UserFacingError(
      "This ticket is closed — please open a new one.",
      "CLOSED",
    );
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success)
    throw new UserFacingError(firstIssue(parsed.error), "VALIDATION");
  await enforceRateLimit(`ticket-reply:${userId}`, 20, 60 * 60 * 1000);

  await db.$transaction([
    db.supportMessage.create({
      data: {
        ticketId,
        author: "CUSTOMER",
        authorId: userId,
        body: parsed.data,
      },
    }),
    // A customer reply re-opens a ticket that was waiting on them or resolved.
    db.supportTicket.update({
      where: { id: ticketId },
      data: { status: "OPEN" },
    }),
  ]);
}

export async function staffReply(
  staffId: string,
  ticketId: string,
  body: unknown,
  status: SupportTicketStatus,
) {
  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    include: { user: true },
  });
  if (!ticket) throw new NotFoundError("Ticket");
  const text = typeof body === "string" ? body.trim() : "";
  if (text.length > 2000)
    throw new UserFacingError("Replies are limited to 2,000 characters.");

  await db.$transaction([
    ...(text
      ? [
          db.supportMessage.create({
            data: { ticketId, author: "STAFF", authorId: staffId, body: text },
          }),
        ]
      : []),
    db.supportTicket.update({ where: { id: ticketId }, data: { status } }),
  ]);
  await audit({
    action: "SUPPORT_TICKET_UPDATED",
    entityType: "SupportTicket",
    entityId: ticketId,
    orderId: ticket.orderId,
    actorType: "ADMIN",
    actorId: staffId,
    data: { status, replied: Boolean(text) },
  });
  if (text) {
    await notifyCustomer("SUPPORT_REPLY", ticket.user, {
      name: ticket.user.name,
      ticketId,
    });
  }
}
