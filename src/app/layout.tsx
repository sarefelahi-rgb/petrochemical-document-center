import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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
        {children}
        <Toaster />
      </body>
    </html>
  );
}
