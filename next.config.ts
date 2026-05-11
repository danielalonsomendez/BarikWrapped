import type { NextConfig } from "next";

const isFirebaseAppHostingEnvironment = Boolean(
  process.env.NEXTJS_ADAPTER_VERSION || process.env.K_SERVICE
);

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {},
};

if (!isFirebaseAppHostingEnvironment) {
  nextConfig.distDir = 'build';
  nextConfig.output = 'export';
}

export default nextConfig;
