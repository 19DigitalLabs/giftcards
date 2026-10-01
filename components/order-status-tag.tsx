import { Tag, type TagVariant } from "@/components/ui";

const STATUS: Record<string, { variant: TagVariant; label: string }> = {
  COMPLETED: { variant: "lime", label: "✓ completed" },
  PENDING: { variant: "violet", label: "⏳ payment pending" },
  FAILED: { variant: "pink", label: "✕ failed" },
  CANCELLED: { variant: "neutral", label: "– cancelled" },
};

/** Order status as a sticker pill. */
export function OrderStatusTag({ status }: { status: string }) {
  const { variant, label } = STATUS[status] ?? {
    variant: "neutral",
    label: status,
  };
  return <Tag variant={variant}>{label}</Tag>;
}
