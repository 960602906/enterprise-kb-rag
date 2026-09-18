import type { NextConfig } from "next";

/**
 * Optional comma-separated hosts for Next.js `allowedDevOrigins` when you
 * access `pnpm dev` through a reverse proxy / tunnel (not localhost).
 * Example: ALLOWED_DEV_ORIGINS=kb.example.com,10.0.0.5
 */
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
};

export default nextConfig;
