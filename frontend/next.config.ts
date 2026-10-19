import type { NextConfig } from "next";

// Local development only: send /api to the FastAPI backend. In production Caddy routes /api itself.
const backend = process.env.BACKEND_URL;

const nextConfig: NextConfig = {
  // Pin the root so the parent prototype's lockfile isn't mistaken for this app's workspace.
  output: "standalone",
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
  poweredByHeader: false,
  images: { unoptimized: true }, // no next/image in use: keep the image optimizer endpoint closed
  ...(backend && { rewrites: async () => [{ source: "/api/:path*", destination: `${backend}/api/:path*` }] }),
};

export default nextConfig;
