export interface NavItem {
  label: string;
  href: string;
}

/** Site-wide identity and navigation. */
export const siteConfig = {
  name: "Gifts19",
  tagline: "Gift cards for the brands you love",
  description:
    "Buy gift cards for your favourite brands — for yourself or someone special. Use them online or in store.",
  nav: [
    { label: "Home", href: "/" },
    { label: "Brands", href: "/brands" },
    { label: "Orders", href: "/orders" },
    { label: "Support", href: "/support" },
  ] satisfies NavItem[],
  legal: [
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "Support", href: "/support" },
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
    { label: "Refund policy", href: "/refund-policy" },
  ] satisfies NavItem[],
};
