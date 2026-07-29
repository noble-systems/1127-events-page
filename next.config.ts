import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Modern formats first. Swap in real photography via content/site.ts and
    // these are served as AVIF/WebP with automatic responsive sizing.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [420, 640, 828, 1080, 1280, 1600, 1920, 2560],
  },
  poweredByHeader: false,
};

export default nextConfig;
