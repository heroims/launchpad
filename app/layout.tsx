import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Launchpad",
  description: "API-first Solana launch workstation"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
