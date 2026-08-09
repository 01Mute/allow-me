import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The button page must never be cached or prerendered — the slug gate and
  // the "already pressed" state are decided per request.
  poweredByHeader: false,
};

export default nextConfig;
