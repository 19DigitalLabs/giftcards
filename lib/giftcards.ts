/** Most units of one product a single cart line can hold. */
export const MAX_QTY = 10;

/** Category icon for the catalogue (fallback 🎁). */
export function categoryEmoji(category: string): string {
  const map: Record<string, string> = {
    Shopping: "🛍️",
    Fashion: "👗",
    "Food & Dining": "🍔",
    Grocery: "🥑",
    Travel: "✈️",
    Entertainment: "🎬",
    Electronics: "🎧",
    "Beauty & Wellness": "💄",
    "Health & Fitness": "🏃",
    Jewellery: "💎",
  };
  return map[category] ?? "🎁";
}

/** Initials for the brand chip fallback, e.g. "BookMyShow" → "BO". */
export function brandInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
