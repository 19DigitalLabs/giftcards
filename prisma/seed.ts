/* Seeds the catalog (brands + carousel offers) and a demo login.
 * Idempotent: wipes and recreates everything. Run: pnpm --filter giftcards db:seed
 *
 * Cashback rates are modeled on Indian gift card stores (Zingoy, Maximize,
 * OnPoints, GyFTR, Woohoo): buyer pays face value and earns cashback. */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const db = new PrismaClient();

const STANDARD = [250, 500, 1000, 2000];
const WIDE = [100, 250, 500, 1000, 2000, 5000];

interface SeedBrand {
  slug: string;
  name: string;
  category: string;
  color: string;
  cashbackPct: number;
  denominations?: number[];
  featured?: boolean;
  description: string;
  /** Where codes get redeemed, e.g. "the Myntra app under Profile → Gift Cards". */
  redeemAt: string;
  /** Extra brand-specific T&C bullets appended to the standard set. */
  extraTerms?: string[];
  validityMonths?: number;
}

/* Standard content templates — brands override redeemAt and add extraTerms. */
function howToRedeem(b: SeedBrand): string[] {
  return [
    `Open your gifts19 order page and copy the ${b.name} voucher code.`,
    `Go to ${b.redeemAt}.`,
    "Enter the code (and PIN, if shown) and confirm — the balance is added instantly.",
    "The balance auto-applies on your next eligible purchase.",
  ];
}

function terms(b: SeedBrand): string[] {
  return [
    `Valid for ${b.validityMonths ?? 12} months from the date of delivery.`,
    "Cannot be exchanged for cash, refunded, or cancelled once delivered.",
    "Can be clubbed with most coupons and sale prices unless the brand says otherwise.",
    "Any remaining balance stays in your brand wallet for the next purchase.",
    "gifts19 is a reseller; the gift card is issued and honoured by the brand.",
    ...(b.extraTerms ?? []),
  ];
}

const brands: SeedBrand[] = [
  // ── Original catalog ────────────────────────────────────────────────────
  { slug: "amazon-pay", name: "Amazon Pay", category: "Shopping", color: "#ff9900", cashbackPct: 3, denominations: WIDE, featured: true, description: "Add balance to Amazon Pay and spend it on anything across Amazon.in — products, bills, recharges and more.", redeemAt: "amazon.in/addgiftcard (or Amazon app → Amazon Pay → Add Gift Card)", extraTerms: ["Balance is capped at ₹10,000 per user per month under RBI PPI rules."] },
  { slug: "flipkart", name: "Flipkart", category: "Shopping", color: "#2874f0", cashbackPct: 5, denominations: WIDE, featured: true, description: "India's homegrown everything store. Redeem against electronics, fashion, home and grocery orders.", redeemAt: "Flipkart app → My Account → Gift Cards → Add a Gift Card" },
  { slug: "myntra", name: "Myntra", category: "Fashion", color: "#ff3f6c", cashbackPct: 10, featured: true, description: "India's fashion destination — 5,000+ brands across clothing, footwear and accessories.", redeemAt: "Myntra app → Profile → Gift Cards → Have a Gift Card" },
  { slug: "ajio", name: "AJIO", category: "Fashion", color: "#2c4152", cashbackPct: 8, description: "Curated fashion from Reliance Retail with exclusive international and indie labels.", redeemAt: "AJIO app → My Account → AJIO Wallet → Add Gift Card" },
  { slug: "lifestyle", name: "Lifestyle", category: "Fashion", color: "#e11b70", cashbackPct: 9, description: "Department-store favourite for apparel, beauty and home across 100+ Indian cities.", redeemAt: "lifestylestores.com checkout, or show the code at any Lifestyle store till" },
  { slug: "fabindia", name: "Fabindia", category: "Fashion", color: "#8b1d1d", cashbackPct: 7, description: "Handcrafted apparel and home products celebrating Indian craft traditions.", redeemAt: "fabindia.com checkout, or any Fabindia store" },
  { slug: "nykaa", name: "Nykaa", category: "Beauty & Wellness", color: "#fc2779", cashbackPct: 7, featured: true, description: "Beauty, skincare and wellness from 2,500+ brands, plus Nykaa's own lines.", redeemAt: "Nykaa app → Account → Gift Cards → Redeem" },
  { slug: "swiggy", name: "Swiggy", category: "Food & Dining", color: "#fc8019", cashbackPct: 8, featured: true, description: "Food delivery, Instamart groceries and Dineout — one balance for all of Swiggy.", redeemAt: "Swiggy app → Account → Swiggy Money → Add Gift Card" },
  { slug: "zomato", name: "Zomato", category: "Food & Dining", color: "#e23744", cashbackPct: 7, description: "Order from your favourite restaurants or book a table — redeemable across Zomato.", redeemAt: "Zomato app → Profile → Zomato Money → Claim Gift Card" },
  { slug: "dominos", name: "Domino's Pizza", category: "Food & Dining", color: "#006491", cashbackPct: 10, description: "India's largest pizza chain — order online or redeem in any Domino's store.", redeemAt: "dominos.co.in checkout → Pay with Gift Card, or any Domino's outlet" },
  { slug: "kfc", name: "KFC", category: "Food & Dining", color: "#a6192e", cashbackPct: 8, description: "Finger-lickin' good chicken, redeemable online and at KFC restaurants nationwide.", redeemAt: "KFC app/website checkout, or show the code at any KFC counter" },
  { slug: "starbucks", name: "Starbucks", category: "Food & Dining", color: "#00704a", cashbackPct: 5, description: "Load a Starbucks card for coffee runs at 400+ stores across India.", redeemAt: "Starbucks India app → Cards → Reload with e-gift, or in store" },
  { slug: "bigbasket", name: "BigBasket", category: "Grocery", color: "#84a824", cashbackPct: 4, description: "India's largest online supermarket — fresh produce, staples and daily essentials.", redeemAt: "BigBasket app → My Account → Wallet → Add Gift Card" },
  { slug: "blinkit", name: "Blinkit", category: "Grocery", color: "#0c831f", cashbackPct: 4, description: "Groceries and essentials delivered in minutes, from Zomato's quick-commerce arm.", redeemAt: "Blinkit app → Account → Wallet → Redeem Gift Card" },
  { slug: "makemytrip", name: "MakeMyTrip", category: "Travel", color: "#eb2026", cashbackPct: 6, featured: true, description: "Flights, hotels and holiday packages — India's biggest online travel agency.", redeemAt: "MakeMyTrip → My Wallet → Gift Cards → Add", extraTerms: ["Convenience fees on flight bookings must be paid separately, not from the gift card balance."] },
  { slug: "yatra", name: "Yatra", category: "Travel", color: "#16569e", cashbackPct: 7, description: "Flights, hotels, buses and holidays with corporate-grade support.", redeemAt: "yatra.com → My Account → eCash → Redeem Gift Voucher" },
  { slug: "easemytrip", name: "EaseMyTrip", category: "Travel", color: "#2196f3", cashbackPct: 8, description: "Zero-convenience-fee flight bookings plus hotels and holiday deals.", redeemAt: "easemytrip.com checkout → Apply Gift Card" },
  { slug: "uber", name: "Uber", category: "Travel", color: "#111111", cashbackPct: 5, description: "Ride credit for Uber trips across 100+ Indian cities — auto, moto, cabs and intercity.", redeemAt: "Uber app → Wallet → Add gift card" },
  { slug: "bookmyshow", name: "BookMyShow", category: "Entertainment", color: "#c4242b", cashbackPct: 10, featured: true, description: "Movies, concerts, plays and live events — India's go-to ticketing platform.", redeemAt: "BookMyShow → Profile → Gift Cards → Redeem" },
  { slug: "pvr-cinemas", name: "PVR Cinemas", category: "Entertainment", color: "#febd15", cashbackPct: 8, description: "The big screen at its best — redeem for tickets and F&B at PVR cinemas.", redeemAt: "pvrcinemas.com checkout or the box office at any PVR cinema" },
  { slug: "google-play", name: "Google Play", category: "Entertainment", color: "#01875f", cashbackPct: 3, denominations: [100, 300, 500, 1000, 1500], description: "Apps, games, and in-app purchases on the Google Play Store.", redeemAt: "Play Store app → Profile → Payments & subscriptions → Redeem code", extraTerms: ["Redeemable only on Indian Google accounts (INR balance)."] },
  { slug: "croma", name: "Croma", category: "Electronics", color: "#0f9d7a", cashbackPct: 6, description: "Tata's electronics superstore — gadgets, appliances and accessories, online or in store.", redeemAt: "croma.com checkout → Pay via Gift Card, or any Croma store" },
  { slug: "reliance-digital", name: "Reliance Digital", category: "Electronics", color: "#e42529", cashbackPct: 5, description: "Electronics and appliances with ResQ service support, at 600+ stores.", redeemAt: "reliancedigital.in checkout, or any Reliance Digital store" },
  { slug: "shoppers-stop", name: "Shoppers Stop", category: "Shopping", color: "#3a3a3a", cashbackPct: 9, description: "Premium department store for fashion, beauty and home across India.", redeemAt: "shoppersstop.com checkout, or the till at any Shoppers Stop" },
  { slug: "decathlon", name: "Decathlon", category: "Shopping", color: "#0082c3", cashbackPct: 6, description: "Sports gear for 70+ sports at prices that get everyone playing.", redeemAt: "decathlon.in checkout → Gift Card, or any Decathlon store" },
  { slug: "tanishq", name: "Tanishq", category: "Jewellery", color: "#832729", cashbackPct: 3, denominations: [1000, 2000, 5000, 10000], description: "Tata's trusted jewellery house — gold, diamonds and everyday fine jewellery.", redeemAt: "any Tanishq showroom or tanishq.co.in checkout", extraTerms: ["Not valid on gold coins and bullion."] },
  { slug: "kalyan", name: "Kalyan Jewellers", category: "Jewellery", color: "#9c1c30", cashbackPct: 2, denominations: [1000, 2000, 5000, 10000], description: "One of India's largest jewellery chains, known for purity and transparent pricing.", redeemAt: "any Kalyan Jewellers showroom" },
  // ── Added after scrubbing Zingoy / Maximize / OnPoints / GyFTR / Woohoo ──
  { slug: "pizza-hut", name: "Pizza Hut", category: "Food & Dining", color: "#ee3124", cashbackPct: 7.5, description: "Pan pizzas, melts and more — order in or dine at 700+ Pizza Hut stores.", redeemAt: "pizzahut.co.in checkout, or any Pizza Hut restaurant" },
  { slug: "baskin-robbins", name: "Baskin Robbins", category: "Food & Dining", color: "#e81f78", cashbackPct: 12, denominations: [100, 250, 500, 1000], description: "31 flavours of happiness — scoops, sundaes, shakes and ice cream cakes.", redeemAt: "any Baskin Robbins parlour, or the BR app checkout" },
  { slug: "barbeque-nation", name: "Barbeque Nation", category: "Food & Dining", color: "#b3242a", cashbackPct: 10, denominations: [500, 1000, 2000, 5000], description: "Live-grill buffets and unlimited starters at 200+ outlets across India.", redeemAt: "the bill counter at any Barbeque Nation outlet" },
  { slug: "chaayos", name: "Chaayos", category: "Food & Dining", color: "#1d6b3f", cashbackPct: 10, denominations: [100, 250, 500, 1000], description: "Meri wali chai — customised chai and snacks at 300+ cafés.", redeemAt: "Chaayos app checkout or any Chaayos café" },
  { slug: "puma", name: "Puma", category: "Fashion", color: "#1e1e1e", cashbackPct: 10, description: "Sportswear, sneakers and athleisure from the big cat.", redeemAt: "in.puma.com checkout, or any Puma store in India" },
  { slug: "levis", name: "Levi's", category: "Fashion", color: "#c41230", cashbackPct: 10, description: "The original jeans since 1873 — denim, tees and jackets.", redeemAt: "levi.in checkout, or any Levi's exclusive store" },
  { slug: "bata", name: "Bata", category: "Fashion", color: "#e2231a", cashbackPct: 8, description: "India's most trusted footwear brand, for the whole family.", redeemAt: "bata.in checkout, or the till at any Bata store" },
  { slug: "westside", name: "Westside", category: "Fashion", color: "#7d2248", cashbackPct: 8, description: "Tata's in-house fashion and home label with 200+ stores.", redeemAt: "westside.com checkout, or any Westside store" },
  { slug: "pantaloons", name: "Pantaloons", category: "Fashion", color: "#3f9c35", cashbackPct: 8, description: "Fresh fashion for the family from Aditya Birla Fashion.", redeemAt: "pantaloons.com checkout, or any Pantaloons store" },
  { slug: "max-fashion", name: "Max Fashion", category: "Fashion", color: "#005baa", cashbackPct: 8, description: "Everyday styles for the family at prices that make you smile.", redeemAt: "maxfashion.in checkout, or any Max store" },
  { slug: "hamleys", name: "Hamleys", category: "Shopping", color: "#ce0e2d", cashbackPct: 10, description: "The finest toy shop in the world — 260 years of play.", redeemAt: "hamleys.in checkout, or any Hamleys store" },
  { slug: "the-body-shop", name: "The Body Shop", category: "Beauty & Wellness", color: "#004236", cashbackPct: 10, description: "Ethically-made skincare, bath and body favourites.", redeemAt: "thebodyshop.in checkout, or any The Body Shop store" },
  { slug: "firstcry", name: "FirstCry", category: "Shopping", color: "#ff8b00", cashbackPct: 8, description: "Asia's largest store for baby and kids — diapers to school gear.", redeemAt: "FirstCry app → Account → Gift Certificates → Redeem" },
  { slug: "apollo-pharmacy", name: "Apollo Pharmacy", category: "Health & Fitness", color: "#00875a", cashbackPct: 6, description: "Medicines, wellness and healthcare essentials from India's largest pharmacy chain.", redeemAt: "Apollo 247 app checkout, or any Apollo Pharmacy store" },
  { slug: "cult-fit", name: "cult.fit", category: "Health & Fitness", color: "#ff3278", cashbackPct: 12, denominations: [500, 1000, 2000, 5000], description: "Gyms, group classes and at-home workouts — fitness that's fun.", redeemAt: "cult.fit app → Profile → Payments → Redeem Voucher" },
  { slug: "cleartrip", name: "Cleartrip", category: "Travel", color: "#ff4f17", cashbackPct: 8, description: "Flights and hotels with a famously clean booking flow.", redeemAt: "cleartrip.com → Wallet → Redeem Gift Card" },
  { slug: "ixigo", name: "ixigo", category: "Travel", color: "#ec5b24", cashbackPct: 8, description: "Trains, flights and buses — India's travel super-app.", redeemAt: "ixigo app → Profile → ixigo money → Redeem Voucher" },
  { slug: "titan", name: "Titan", category: "Jewellery", color: "#862633", cashbackPct: 6, denominations: [500, 1000, 2000, 5000], description: "Watches and accessories from India's most loved lifestyle brand.", redeemAt: "titan.co.in checkout, or any World of Titan store" },
];

const offers = [
  { sort: 1, badge: "TOP DROP", title: "10% back in Gems on Myntra", subtitle: "Stack it on the End of Reason Sale — pay face value, Gems land in your wallet.", brandSlug: "myntra" },
  { sort: 2, badge: "SWEET DEAL", title: "12% Gems on Baskin Robbins", subtitle: "The highest rate on the store right now. Ice cream that literally pays you back.", brandSlug: "baskin-robbins" },
  { sort: 3, badge: "FOOD", title: "8% Gems on every Swiggy order", subtitle: "Buy once, eat all month — works on food, Instamart and Dineout.", brandSlug: "swiggy" },
  { sort: 4, badge: "LIMITED", title: "Movie nights, 10% back in Gems", subtitle: "BookMyShow gift cards for films, concerts and live events.", brandSlug: "bookmyshow" },
  { sort: 5, badge: "FITNESS", title: "cult.fit cards give 12% Gems", subtitle: "Get fit, get paid — Gems on gyms, classes and home workouts.", brandSlug: "cult-fit" },
];

async function main() {
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.cartItem.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.offer.deleteMany();
  await db.brand.deleteMany();

  for (const b of brands) {
    await db.brand.create({
      data: {
        slug: b.slug,
        name: b.name,
        category: b.category,
        description: b.description,
        color: b.color,
        cashbackPct: b.cashbackPct,
        denominations: JSON.stringify(b.denominations ?? STANDARD),
        howToRedeem: JSON.stringify(howToRedeem(b)),
        terms: JSON.stringify(terms(b)),
        validityMonths: b.validityMonths ?? 12,
        featured: b.featured ?? false,
      },
    });
  }
  for (const o of offers) {
    await db.offer.create({ data: o });
  }

  await db.user.create({
    data: {
      name: "Demo User",
      email: "demo@gifts19.in",
      passwordHash: hashPassword("demo1234"),
    },
  });

  console.log(`Seeded ${brands.length} brands, ${offers.length} offers.`);
  console.log("Demo login: demo@gifts19.in / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
