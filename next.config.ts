import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Modern formats first. Swap in real photography via content/site.ts and
    // these are served as AVIF/WebP with automatic responsive sizing.
    formats: ["image/avif", "image/webp"],
    // Next refuses to optimise a remote image unless its host is listed here,
    // so event photographs would 400 without this. Scoped to our own bucket:
    // a wildcard would let any stored value turn into a request to any host.
    remotePatterns: [
      {
        protocol: "https",
        hostname:
          "1127-events-images-769194516210-us-west-1.s3.us-west-1.amazonaws.com",
        pathname: "/**",
      },
    ],
    deviceSizes: [420, 640, 828, 1080, 1280, 1600, 1920, 2560],
    // Image URLs are versioned per upload, so an optimized variant can never
    // go stale: a replaced photo is a new URL, not new bytes at an old one.
    minimumCacheTTL: 31536000,
  },
  poweredByHeader: false,
};

export default nextConfig;
