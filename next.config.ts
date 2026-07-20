import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript; Next compiles them on the fly,
  // so there is no build step for packages/* in development.
  transpilePackages: ["@platform/types", "@platform/utils"],
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
};

export default nextConfig;
