import { cn } from "@/lib/utils";

/** GET form into /brands — one glowing pill, works without JavaScript. */
export function BrandSearch({
  defaultValue = "",
  className,
}: {
  defaultValue?: string;
  className?: string;
}) {
  return (
    <form
      action="/brands"
      className={cn(
        "flex items-center gap-2 rounded-full border border-border bg-card p-1.5 pl-5 transition-colors focus-within:border-primary/60",
        className,
      )}
    >
      <span aria-hidden>🔍</span>
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search brands — Myntra, Swiggy, Amazon…"
        aria-label="Search brands"
        className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        className="h-10 shrink-0 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-glow transition-all hover:bg-primary-strong active:scale-95"
      >
        Search
      </button>
    </form>
  );
}
