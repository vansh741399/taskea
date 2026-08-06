import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    ".space-z.ai",
  ],
  turbopack: {},
  webpack: (config, { isServer }) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/examples/**', '**/skills/**', '**/node_modules/**'],
    };
    return config;
  },
};

export default nextConfig;

