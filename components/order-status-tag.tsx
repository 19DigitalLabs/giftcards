import type { OrderStatus } from "@prisma/client";
import { ORDER_STATUS_COPY } from "@/lib/order-display";
import { Tag, type TagVariant } from "@/components/ui";

const TONE: Record<string, TagVariant> = {
  success: "lime",
  progress: "violet",
  warning: "pink",
  neutral: "neutral",
};

/** Order status as a customer-safe pill. */
export function OrderStatusTag({ status }: { status: OrderStatus }) {
  const copy = ORDER_STATUS_COPY[status];
  return <Tag variant={TONE[copy.tone] ?? "neutral"}>{copy.label}</Tag>;
}
