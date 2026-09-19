import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // distDir قابل بازنویسی با متغیر محیطی — برای شبیه‌سازی build استقرار بدون دست‌زدن به .next سرور توسعه
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // نکته: turbopack.root و outputFileTracingRoot عمداً حذف شدند — این تنظیمات باعث می‌شد
  // کل ریشهٔ workspace (skills/ با ۶۱MB، docs، tests، upload و…) به‌صورت کامل داخل
  // خروجی standalone کپی شود و حجم artifact از محدودیت استقرار عبور کند.
  // تشخیص خودکار ریشه از bun.lock همین پروژه کافی و دقیق است.
  // حذف پوشه‌های غیرضروری از خروجی standalone (لایهٔ دوم حفاظت)
  outputFileTracingExcludes: {
    "*": [
      "./skills/**",
      "./docs/**",
      "./tests/**",
      "./examples/**",
      "./mini-services/**",
      "./worker/**",
      "./scripts/**",
      "./assets/**",
      "./upload/**",
      "./download/**",
      "./.next-deploy-test/**",
      // دیتابیس و داده‌های کاربران نباید داخل artifact استقرار کپی شوند —
      // در محیط تازه bootstrap از schema.sql دیتابیس می‌سازد
      "./db/**",
      "./data/objectstore/**",
      "./data/tmp/**",
      "./*.log",
      "./worklog.md",
      "./Caddyfile",
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // pdfjs-dist باید خارج از باندل سرور بارگذاری شود (fake worker از node_modules)
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
