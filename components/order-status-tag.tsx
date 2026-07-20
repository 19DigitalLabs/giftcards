import { Tag } from "@/components/ui";

/** Order status as a sticker pill. */
export function OrderStatusTag({ status }: { status: string }) {
  return (
    <Tag variant={status === "COMPLETED" ? "lime" : "pink"}>
      {status === "COMPLETED" ? "✓ completed" : "✕ failed"}
    </Tag>
  );
}
