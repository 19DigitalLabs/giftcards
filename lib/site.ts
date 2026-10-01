export interface NavItem {
  label: string;
  href: string;
}

/** Site-wide identity and navigation. */
export const siteConfig = {
  name: "Gifts19",
  tagline: "Digital gift cards from India's favourite brands",
  description:
    "Buy digital gift cards for popular Indian brands — shopping, food, travel and entertainment — delivered to your account.",
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
