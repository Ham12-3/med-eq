import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright runs its own dev server with NEXT_DIST_DIR=.next-e2e so it never clashes with `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
