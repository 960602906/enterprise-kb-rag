import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Public SSH tunnel host hits this Next.dev server; allow HMR/dev assets.
  allowedDevOrigins: ["115.190.128.7"],
};

export default nextConfig;
