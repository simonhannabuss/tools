import type { NextConfig } from "next";

// The app is served from a sub-folder of the website: https://simonhannabuss.co.uk/tools
// Set BASE_PATH="" when building to run it at the root of a domain instead.
const basePath = process.env.BASE_PATH ?? "/tools";

const nextConfig: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Native / server-only packages that must not be bundled.
  serverExternalPackages: ["@node-rs/argon2", "bullmq", "ioredis", "pg"],
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" }, // videos go through /api/upload, not server actions
  },
};

export default nextConfig;
