import { isDemoMode } from "@/lib/config";

/** Thin, always-visible staging banner in APP_MODE=demo. */
export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="border-b border-orange/30 bg-orange/10 px-4 py-2 text-center text-xs font-bold text-orange">
      Demo environment — payments and gift cards are simulated. Nothing here has
      real value.
    </div>
  );
}
