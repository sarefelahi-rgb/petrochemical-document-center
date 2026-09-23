import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { getThemeBootScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: "مرکز هوشمند اسناد اداره مهندسی عمومی فراورش یک",
  description: "مرکز هوشمند اسناد اداره مهندسی عمومی فراورش یک — رابط فارسی راست‌به‌چپ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen">
        {/* اعمال تم ذخیره‌شده (رنگ/فونت/اندازه/تیره) پیش از اولین رنگ‌آمیزی — ضد-فلش */}
        <script dangerouslySetInnerHTML={{ __html: getThemeBootScript() }} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
