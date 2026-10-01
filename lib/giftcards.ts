/** Most units of one denomination a single cart line can hold. */
export const MAX_QTY = 10;

/** Parses the Brand.denominations JSON column into a sorted rupee list. */
export function parseDenominations(json: string): number[] {
  return (JSON.parse(json) as number[]).sort((a, b) => a - b);
}

/** Formats a Gems amount (our cashback currency, 1 Gem = ₹1), e.g. "1,250 Gems". */
export function formatGems(amount: number): string {
  return `${amount.toLocaleString("en-IN")} ${amount === 1 ? "Gem" : "Gems"}`;
}

/** Cashback earned (at the base/UPI rate) on one card of this face value. */
export function cashbackAmount(
  denomination: number,
  cashbackPct: number,
): number {
  return Math.round((denomination * cashbackPct) / 100);
}

/** Sticker emoji per catalog category (fallback 🎁). */
export function categoryEmoji(category: string): string {
  const map: Record<string, string> = {
    Shopping: "🛍️",
    Fashion: "👗",
    "Food & Dining": "🍔",
    Grocery: "🥑",
    Travel: "✈️",
    Entertainment: "🎬",
    Electronics: "🎧",
    "Beauty & Wellness": "💅",
    "Health & Fitness": "💪",
    Jewellery: "💎",
  };
  return map[category] ?? "🎁";
}

/** Initials for the brand chip, e.g. "BookMyShow" → "BM". */
export function brandInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
