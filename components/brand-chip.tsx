"use client";

import { useState } from "react";
import { cn } from "@platform/utils";
import { brandInitials } from "@/lib/giftcards";

const sizes = {
  sm: "size-10 rounded-xl text-sm",
  md: "size-14 rounded-2xl text-lg",
  lg: "size-24 rounded-3xl text-3xl",
} as const;

const pads = { sm: "p-1.5", md: "p-2", lg: "p-3.5" } as const;

/**
 * Brand logo (from /public/logos/{slug}.png) on a white tile so dark logos
 * stay visible on the dark theme. Falls back to colored initials if the
 * image is missing or fails to load.
 */
export function BrandChip({
  name,
  color,
  slug,
  size = "md",
  className,
}: {
  name: string;
  color: string;
  slug?: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!slug || failed) {
    return (
      <div
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center font-display font-extrabold text-white",
          sizes[size],
          className,
        )}
        style={{ backgroundColor: color, boxShadow: `0 8px 24px ${color}55` }}
      >
        {brandInitials(name)}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-white",
        sizes[size],
        pads[size],
        className,
      )}
      style={{ boxShadow: `0 8px 24px ${color}40` }}
    >
      <img
        src={`/logos/${slug}.png`}
        alt={`${name} logo`}
        loading="lazy"
        className="size-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
