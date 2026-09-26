import type { NextConfig } from "next";

/** Static export: `next build` writes out/, which FastAPI serves at the origin root. */
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
