import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["lightningcss", "lightningcss-darwin-arm64"],
};

export default nextConfig;
