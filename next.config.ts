import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ریشهٔ workspace را قطعی می‌کند — در build تودرتو (محیط استقرار پلتفرم) توربوپک
  // ریشه را اشتباه استنتاج نمی‌کند و خروجی standalone کامل باقی می‌ماند (server.js)
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingRoot: process.cwd(),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // pdfjs-dist باید خارج از باندل سرور بارگذاری شود (fake worker از node_modules)
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
