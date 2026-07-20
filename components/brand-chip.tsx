"use client";

import { useState } from "react";
import { cn } from "@platform/utils";
import { brandInitials } from "@/lib/giftcards";

const sizes = {
  sm: "size-10 text-sm",
  md: "size-14 text-lg",
  lg: "size-24 text-3xl",
} as const;

const pads = { sm: "p-1", md: "p-2", lg: "p-3" } as const;

/**
 * Circular brand logo (from /public/logos/{slug}.png) on a white disc so
 * dark logos stay visible on the dark theme. Falls back to colored initials
 * if the image is missing or fails to load.
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
          "flex shrink-0 items-center justify-center rounded-full font-display font-extrabold text-white",
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
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white",
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
        className="size-full rounded-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
