import type { NextConfig } from "next";

const isFirebaseAppHostingBuild = Boolean(process.env.NEXTJS_ADAPTER_VERSION);

const nextConfig: NextConfig = {
  ...(isFirebaseAppHostingBuild ? {} : { output: 'export' as const }),
  distDir: isFirebaseAppHostingBuild ? '.next' : 'build',
  images: {
    unoptimized: true,
  },
  turbopack: {},
};

export default nextConfig;
