"use server";

import type { SupportTicketStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicMessage } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { addCustomerMessage, createTicket, staffReply } from "@/lib/support";

export interface FormState {
  error?: string;
  success?: string;
}

/** Updates the signed-in customer's display name. */
export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Faccount");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80)
    return { error: "Name must be 2–80 characters." };

  const phoneInput = String(formData.get("phone") ?? "").trim();
  const phone = phoneInput ? normalizePhone(phoneInput) : null;
  if (phoneInput && !phone) {
    return {
      error:
        "Enter a valid mobile number, e.g. 98765 43210 or +91 98765 43210.",
    };
  }
  // WhatsApp needs a number and an explicit tick; the opt-in time is kept.
  const optIn = Boolean(phone) && formData.get("whatsappOptIn") === "on";
  await db.user.update({
    where: { id: user.id },
    data: {
      name,
      phone,
      whatsappOptIn: optIn,
      whatsappOptInAt: optIn
        ? user.whatsappOptIn
          ? user.whatsappOptInAt
          : new Date()
        : null,
    },
  });
  revalidatePath("/", "layout");
  return { success: "Profile updated." };
}

export async function createTicketAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Faccount%2Fsupport%2Fnew");
  let ticketId: string;
  try {
    const ticket = await createTicket(user, {
      category: formData.get("category"),
      subject: formData.get("subject"),
      orderId: formData.get("orderId"),
      message: formData.get("message"),
    });
    ticketId = ticket.id;
  } catch (error) {
    return { error: publicMessage(error) };
  }
  redirect(`/account/support/${ticketId}?created=1`);
}

export async function replyTicketAction(
  ticketId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user)
    redirect(
      `/login?next=${encodeURIComponent(`/account/support/${ticketId}`)}`,
    );
  try {
    await addCustomerMessage(user.id, ticketId, formData.get("message"));
  } catch (error) {
    return { error: publicMessage(error) };
  }
  revalidatePath(`/account/support/${ticketId}`);
  return { success: "Message sent." };
}

const STATUSES: SupportTicketStatus[] = [
  "OPEN",
  "AWAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
];

/** Staff reply / status change from the ops console. */
export async function staffReplyAction(
  ticketId: string,
  formData: FormData,
): Promise<void> {
  const staff = await requireStaff(`/admin/support/${ticketId}`);
  const status =
    STATUSES.find((s) => s === formData.get("status")) ?? "AWAITING_CUSTOMER";
  let msg = "Saved";
  try {
    await staffReply(staff.id, ticketId, formData.get("message"), status);
  } catch (error) {
    msg = `Failed: ${publicMessage(error)}`;
  }
  revalidatePath("/admin/support", "layout");
  redirect(`/admin/support/${ticketId}?msg=${encodeURIComponent(msg)}`);
}
