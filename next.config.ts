import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // pdfjs-dist باید خارج از باندل سرور بارگذاری شود (fake worker از node_modules)
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
