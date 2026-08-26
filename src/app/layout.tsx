import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Mono } from "next/font/google";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

const space = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-space",
});

export const metadata: Metadata = {
  title: "Neural Terminal · Freqtrade",
  description: "安全的 Freqtrade 机器人监控终端",
  applicationName: "Neural Terminal",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0e0e0e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" className={`dark ${jetbrains.variable} ${space.variable}`}>
      <body>
        <a href="#main-content" className="skip-link">跳到主要内容</a>
        {children}
      </body>
    </html>
  );
}
