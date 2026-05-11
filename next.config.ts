import type { NextConfig } from "next";

const isFirebaseAppHostingBuild = Boolean(process.env.NEXTJS_ADAPTER_VERSION);

const nextConfig: NextConfig = {
  distDir: isFirebaseAppHostingBuild ? '.next' : 'build',
  images: {
    unoptimized: true,
  },
  turbopack: {},
};

if (!isFirebaseAppHostingBuild) {
  nextConfig.output = 'export';
}

export default nextConfig;
