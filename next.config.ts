import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  turbopack: {},
};

// PWA webpack plugin only in production builds (`npm run build --webpack`)
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  fallbacks: {
    document: "/offline",
  },
});

export default process.env.NODE_ENV === "development"
  ? nextConfig
  : withPWA(nextConfig);
