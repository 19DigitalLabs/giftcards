import type { NavItem } from "@platform/types";

/** Site-wide identity and navigation — the one place to rename or re-nav the app. */
export const siteConfig = {
  name: "gifts19",
  tagline: "gift cards that hit different",
  description:
    "Buy gift cards for India's top brands — Amazon Pay, Myntra, Swiggy, MakeMyTrip and more — at up to 10% off, delivered instantly.",
  organization: "19 Digital Labs",
  nav: [
    { label: "Home", href: "/" },
    { label: "Brands", href: "/brands" },
    { label: "Orders", href: "/orders" },
  ] satisfies NavItem[],
};
