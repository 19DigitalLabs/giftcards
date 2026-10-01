/*
 * Seed data for the DEMO provider's catalogue (the simulated supplier's own
 * product list — see lib/demo/provider-server.ts). Everything here is
 * invented for testing:
 *
 *   costBps     what the demo supplier charges us below face value
 *               (DEMO numbers — NOT any real distributor's rates)
 *   discountBps our demo customer discount (a business rule we'd set)
 *
 * Terms are placeholders on purpose: real terms/redemption steps must come
 * from the issuer/provider before launch. Logos are local demo assets whose
 * production usage rights are unconfirmed.
 */

export interface DemoBrandSeed {
  ref: string;
  name: string;
  category: string;
  color: string;
  description: string;
  denominations: number[]; // rupees
  costBps: number;
  discountBps: number;
  validityMonths: number;
  featured?: boolean;
  hasPin?: boolean;
}

export const DEMO_TERMS = [
  "Demo terms — replace with issuer/provider supplied terms before launch.",
  "This is a TEST gift card on a demo environment. It has no value and cannot be redeemed anywhere.",
];

export const DEMO_HOW_TO_REDEEM = [
  "Demo instructions — the issuer's official redemption steps will appear here.",
  "Open your order on Gifts19 and tap Reveal to see the code.",
  "Redeem it on the brand's website or app as described by the issuer.",
];

export const DEMO_BRANDS: DemoBrandSeed[] = [
  {
    ref: "AMAZONPAY",
    name: "Amazon Pay",
    category: "Shopping",
    color: "#ff9900",
    description: "Add balance to Amazon Pay and spend it across Amazon.in.",
    denominations: [100, 250, 500, 1000, 2000, 5000],
    costBps: 250,
    discountBps: 100,
    validityMonths: 12,
    featured: true,
  },
  {
    ref: "FLIPKART",
    name: "Flipkart",
    category: "Shopping",
    color: "#2874f0",
    description:
      "Redeem against electronics, fashion, home and grocery orders on Flipkart.",
    denominations: [250, 500, 1000, 2000, 5000],
    costBps: 300,
    discountBps: 150,
    validityMonths: 12,
    featured: true,
    hasPin: true,
  },
  {
    ref: "MYNTRA",
    name: "Myntra",
    category: "Fashion",
    color: "#ff3f6c",
    description: "Fashion, footwear and accessories from thousands of brands.",
    denominations: [500, 1000, 2000, 5000],
    costBps: 600,
    discountBps: 300,
    validityMonths: 12,
    featured: true,
    hasPin: true,
  },
  {
    ref: "SWIGGY",
    name: "Swiggy",
    category: "Food & Dining",
    color: "#fc8019",
    description: "Food delivery, Instamart groceries and Dineout.",
    denominations: [250, 500, 1000, 2000],
    costBps: 400,
    discountBps: 200,
    validityMonths: 12,
    featured: true,
  },
  {
    ref: "ZOMATO",
    name: "Zomato",
    category: "Food & Dining",
    color: "#e23744",
    description: "Food delivery and dining out across Indian cities.",
    denominations: [250, 500, 1000, 2000],
    costBps: 400,
    discountBps: 200,
    validityMonths: 12,
  },
  {
    ref: "BOOKMYSHOW",
    name: "BookMyShow",
    category: "Entertainment",
    color: "#c4242b",
    description: "Movies, concerts, plays and live events.",
    denominations: [250, 500, 1000, 2000],
    costBps: 500,
    discountBps: 250,
    validityMonths: 6,
    featured: true,
  },
  {
    ref: "NYKAA",
    name: "Nykaa",
    category: "Beauty & Wellness",
    color: "#fc2779",
    description: "Beauty, skincare and wellness products.",
    denominations: [500, 1000, 2000, 5000],
    costBps: 500,
    discountBps: 250,
    validityMonths: 12,
    hasPin: true,
  },
  {
    ref: "MAKEMYTRIP",
    name: "MakeMyTrip",
    category: "Travel",
    color: "#0a7cd1",
    description: "Flights, hotels, holidays and buses.",
    denominations: [1000, 2000, 5000],
    costBps: 300,
    discountBps: 150,
    validityMonths: 12,
    featured: true,
  },
  {
    ref: "AJIO",
    name: "AJIO",
    category: "Fashion",
    color: "#2c4152",
    description: "Curated fashion with international and independent labels.",
    denominations: [500, 1000, 2000],
    costBps: 600,
    discountBps: 300,
    validityMonths: 12,
  },
  {
    ref: "DOMINOS",
    name: "Domino's Pizza",
    category: "Food & Dining",
    color: "#006491",
    description: "Order online or redeem at participating stores.",
    denominations: [250, 500, 1000],
    costBps: 500,
    discountBps: 250,
    validityMonths: 6,
  },
  {
    ref: "STARBUCKS",
    name: "Starbucks",
    category: "Food & Dining",
    color: "#00704a",
    description: "Coffee, food and merchandise at participating stores.",
    denominations: [250, 500, 1000],
    costBps: 300,
    discountBps: 150,
    validityMonths: 12,
  },
  {
    ref: "UBER",
    name: "Uber",
    category: "Travel",
    color: "#111111",
    description: "Rides and deliveries in the Uber app.",
    denominations: [250, 500, 1000, 2000],
    costBps: 250,
    discountBps: 100,
    validityMonths: 12,
  },
  {
    ref: "CROMA",
    name: "Croma",
    category: "Electronics",
    color: "#0a7d6f",
    description: "Electronics and appliances online and in stores.",
    denominations: [1000, 2000, 5000],
    costBps: 250,
    discountBps: 100,
    validityMonths: 12,
  },
  {
    ref: "DECATHLON",
    name: "Decathlon",
    category: "Health & Fitness",
    color: "#0082c3",
    description: "Sports gear for 70+ sports.",
    denominations: [500, 1000, 2000],
    costBps: 300,
    discountBps: 150,
    validityMonths: 12,
  },
  {
    ref: "PVRCINEMAS",
    name: "PVR Cinemas",
    category: "Entertainment",
    color: "#d4a20b",
    description: "Movie tickets and food & beverages.",
    denominations: [250, 500, 1000],
    costBps: 500,
    discountBps: 250,
    validityMonths: 6,
  },
  {
    ref: "BIGBASKET",
    name: "bigbasket",
    category: "Grocery",
    color: "#84c225",
    description: "Groceries and household essentials.",
    denominations: [500, 1000, 2000],
    costBps: 250,
    discountBps: 100,
    validityMonths: 12,
  },
  {
    ref: "GOOGLEPLAY",
    name: "Google Play",
    category: "Entertainment",
    color: "#34a853",
    description: "Apps, games, books and in-app purchases.",
    denominations: [100, 250, 500, 1000],
    costBps: 150,
    discountBps: 50,
    validityMonths: 12,
  },
  {
    ref: "TANISHQ",
    name: "Tanishq",
    category: "Jewellery",
    color: "#832729",
    description: "Gold and diamond jewellery at participating stores.",
    denominations: [1000, 2000, 5000],
    costBps: 200,
    discountBps: 100,
    validityMonths: 12,
  },
];

/** Our URL slug / logo file for a demo brand ref, e.g. AMAZONPAY → amazon-pay. */
export const DEMO_SLUGS: Record<string, string> = {
  AMAZONPAY: "amazon-pay",
  FLIPKART: "flipkart",
  MYNTRA: "myntra",
  SWIGGY: "swiggy",
  ZOMATO: "zomato",
  BOOKMYSHOW: "bookmyshow",
  NYKAA: "nykaa",
  MAKEMYTRIP: "makemytrip",
  AJIO: "ajio",
  DOMINOS: "dominos",
  STARBUCKS: "starbucks",
  UBER: "uber",
  CROMA: "croma",
  DECATHLON: "decathlon",
  PVRCINEMAS: "pvr-cinemas",
  BIGBASKET: "bigbasket",
  GOOGLEPLAY: "google-play",
  TANISHQ: "tanishq",
};

export function demoProductRef(brandRef: string, rupees: number): string {
  return `${brandRef}-${rupees}`;
}
