import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["googleapis", "unpdf", "@electric-sql/pglite"],
  outputFileTracingIncludes: {
    "*": ["./data/papers.csv"],
  },
};

export default nextConfig;
