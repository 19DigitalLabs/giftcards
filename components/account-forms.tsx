"use client";

import { useActionState } from "react";
import {
  createTicketAction,
  replyTicketAction,
  updateProfileAction,
  type FormState,
} from "@/lib/actions/account";
import { SubmitButton } from "@/components/submit-button";
import { inputClasses, Notice, textareaClasses } from "@/components/ui";

const label = "block text-sm font-bold";

function Feedback({ state }: { state: FormState }) {
  return (
    <>
      {state.error && <Notice variant="error">{state.error}</Notice>}
      {state.success && <Notice variant="success">{state.success}</Notice>}
    </>
  );
}

export function ProfileForm({
  name,
  phone,
  whatsappOptIn,
  whatsappEnabled,
}: {
  name: string;
  phone: string;
  whatsappOptIn: boolean;
  /** WhatsApp notifications are configured on this deployment. */
  whatsappEnabled: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updateProfileAction,
    {},
  );
  return (
    <form action={action} className="max-w-md space-y-4">
      <label className={label}>
        Full name
        <input
          name="name"
          defaultValue={name}
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
          className={`mt-1.5 ${inputClasses}`}
        />
      </label>
      <label className={label}>
        Mobile number{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={phone}
          maxLength={20}
          autoComplete="tel"
          placeholder="98765 43210"
          className={`mt-1.5 ${inputClasses}`}
        />
      </label>
      {whatsappEnabled && (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="whatsappOptIn"
            defaultChecked={whatsappOptIn}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="font-bold">Send me order updates on WhatsApp</span>
            <span className="block text-xs text-muted-foreground">
              Payment, gift card ready, refund and support updates. Never your
              gift card code. You can turn this off any time.
            </span>
          </span>
        </label>
      )}
      <Feedback state={state} />
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}

export function NewTicketForm({
  categories,
  orders,
  defaultOrderId,
}: {
  categories: { value: string; label: string }[];
  orders: { id: string; label: string }[];
  defaultOrderId?: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    createTicketAction,
    {},
  );
  return (
    <form action={action} className="max-w-xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Topic
          <select
            name="category"
            required
            defaultValue={defaultOrderId ? "ORDER_NOT_RECEIVED" : ""}
            className={`mt-1.5 ${inputClasses}`}
          >
            <option value="" disabled>
              Choose a topic
            </option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Related order{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
          <select
            name="orderId"
            defaultValue={defaultOrderId ?? ""}
            className={`mt-1.5 ${inputClasses}`}
          >
            <option value="">No specific order</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={label}>
        Subject
        <input
          name="subject"
          required
          minLength={4}
          maxLength={120}
          placeholder="e.g. Paid but no gift card yet"
          className={`mt-1.5 ${inputClasses}`}
        />
      </label>
      <label className={label}>
        Describe the issue
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          placeholder="What happened, and what did you expect?"
          className={`mt-1.5 ${textareaClasses}`}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Never share your full gift card code or PIN — we can look it up from
        your order.
      </p>
      <Feedback state={state} />
      <SubmitButton pendingLabel="Submitting…">Submit ticket</SubmitButton>
    </form>
  );
}

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState<FormState, FormData>(
    replyTicketAction.bind(null, ticketId),
    {},
  );
  return (
    <form action={action} className="space-y-3">
      <label className={label}>
        Add a reply
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={2000}
          rows={3}
          className={`mt-1.5 ${textareaClasses}`}
        />
      </label>
      <Feedback state={state} />
      <SubmitButton size="sm" pendingLabel="Sending…">
        Send reply
      </SubmitButton>
    </form>
  );
}
