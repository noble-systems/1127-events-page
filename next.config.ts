import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * WebP only, and deliberately not AVIF. Variants are encoded on demand by
     * the server the FIRST time each width is requested, and measured against
     * production the AVIF encode cost 1.8s at w=828 and 5.6s at w=2560 before
     * the CDN had it; every fresh device size or edge location paid seconds.
     * WebP encodes an order of magnitude faster for files ~25% larger, and on
     * a site whose caches are mostly cold, latency is the scarcer currency.
     */
    formats: ["image/webp"],
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
    // Five rungs, not eight. Every rung is a separate on-demand encode per
    // image, so a shorter ladder means the variant a visitor needs is far
    // more likely to be sitting warm in the CDN already.
    deviceSizes: [640, 828, 1080, 1600, 2560],
    // Image URLs are versioned per upload, so an optimized variant can never
    // go stale: a replaced photo is a new URL, not new bytes at an old one.
    minimumCacheTTL: 31536000,
  },
  poweredByHeader: false,
};

export default nextConfig;
