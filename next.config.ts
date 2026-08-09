import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Lets the dev server be opened from a phone on the same network for real
  // device testing. Development only — production is unaffected.
  allowedDevOrigins: ["192.168.1.113"],
};

export default nextConfig;
