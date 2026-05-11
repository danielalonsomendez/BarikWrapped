import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: 'build',
  images: {
    unoptimized: true,
  },
  turbopack: {},
};

export default nextConfig;
