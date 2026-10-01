import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/* Baseline hardening for every response. */
const securityHeaders = [
  // Nobody may frame us (clickjacking on checkout / voucher pages).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak order ids / reset tokens in the Referer to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Dev-only: lets phones on the LAN use the dev server. Next blocks
  // non-localhost origins by default, which silently breaks client-side
  // navigation and server actions ("clicks do nothing" on mobile).
  allowedDevOrigins: [
    "192.168.0.1",
    "192.168.1.10",
    "192.168.*",
    "10.*",
    "172.16.*",
  ],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages showing voucher codes or tokens must never be cached by proxies.
      {
        source:
          "/(orders|payment|reset-password|verify-email|account|admin|demo|pay|checkout|cart)/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
