import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Binance Chart Lab",
  description: "Biểu đồ Binance Spot và Futures, chỉ báo cá nhân và Pine Script cơ bản.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
