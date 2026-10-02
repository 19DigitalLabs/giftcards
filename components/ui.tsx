import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/* gifts19's own UI primitives — intentionally NOT the platform design
 * system. Pills, glass surfaces, lime glow. */

export function Container({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}
      {...props}
    />
  );
}

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  containerClassName?: string;
}

export function Section({
  className,
  containerClassName,
  children,
  ...props
}: SectionProps) {
  return (
    <section className={cn("py-16 sm:py-24", className)} {...props}>
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}

/** Glass card: soft border, big radius, raised surface. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-3xl border border-border bg-card p-6", className)}
      {...props}
    />
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95 disabled:pointer-events-none disabled:opacity-40";

const buttonVariants = {
  primary:
    "bg-primary text-primary-foreground shadow-glow hover:bg-primary-strong hover:shadow-glow-lg active:bg-primary-pressed",
  outline:
    "border border-border bg-foreground/5 text-foreground hover:bg-foreground/10",
  ghost: "text-accent-foreground hover:bg-accent-soft",
} as const;

const buttonSizes = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-8 text-base",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/** Button styles as a class string, for styling <Link> as a button. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: ButtonStyleProps = {}): string {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {}

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return (
    <button
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}

const tagVariants = {
  lime: "bg-primary/15 text-primary",
  violet: "bg-accent-soft text-accent-foreground",
  pink: "bg-pink/15 text-pink",
  neutral: "bg-muted text-muted-foreground",
} as const;

export type TagVariant = keyof typeof tagVariants;

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant;
}

/** Sticker pill. */
export function Tag({ variant = "neutral", className, ...props }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold tracking-wider uppercase",
        tagVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Text input styles shared by every form. */
export const inputClasses =
  "h-10 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground";

/** Multi-line variant of inputClasses. */
export const textareaClasses =
  "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground";

const noticeVariants = {
  error: "border-pink/40 bg-pink/10 text-pink",
  success: "border-primary/40 bg-primary/10 text-primary",
  info: "border-accent-soft-border bg-accent-soft text-accent-foreground",
} as const;

/** Inline banner for form errors, confirmations and notes. */
export function Notice({
  variant = "info",
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  variant?: keyof typeof noticeVariants;
}) {
  return (
    <p
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm font-bold",
        noticeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}
