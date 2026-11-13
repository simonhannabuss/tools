import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / server-only packages that must not be bundled.
  serverExternalPackages: ["@node-rs/argon2", "bullmq", "ioredis", "pg"],
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" }, // videos go through /api/upload, not server actions
  },
};

export default nextConfig;
