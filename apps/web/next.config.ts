import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@claimrail/contracts",
    "@claimrail/core",
    "@claimrail/db",
    "@claimrail/dreamdex",
    "@claimrail/ui",
  ],
  experimental: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    },
  },
};

export default nextConfig;
