import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Notice } from "@/components/ui";

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "warn" | "ok";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-2xl font-extrabold",
          tone === "warn" && "text-pink",
          tone === "ok" && "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function AdminMessage({ msg }: { msg?: string | string[] }) {
  if (typeof msg !== "string") return null;
  return (
    <Notice
      variant={/failed/i.test(msg) ? "error" : "success"}
      className="mb-6"
    >
      {msg.slice(0, 300)}
    </Notice>
  );
}

export function Table({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted text-xs text-muted-foreground uppercase">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-bold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export const td = "px-3 py-2 align-top";
export const smallButton =
  "rounded-full border border-border px-3 py-1 text-xs font-bold hover:border-primary/60 hover:text-primary disabled:opacity-40";
