import type { Metadata } from "next";
import "./globals.css";
import { WalletProviders } from "@/lib/wallet/wallet-providers";

export const metadata: Metadata = {
  title: "Launchpad",
  description: "API-first Solana launch workstation"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var l=localStorage.getItem("launchpad.locale");if(l!="zh"&&l!="en")l=navigator.language?.startsWith("zh")?"zh":"en";document.documentElement.lang=l}catch(e){}})()`
          }}
        />
      </head>
      <body><WalletProviders>{children}</WalletProviders></body>
    </html>
  );
}
