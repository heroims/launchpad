import type { Metadata } from "next";
import "./globals.css";
import { WalletProviders } from "@/lib/wallet/wallet-providers";

export const metadata: Metadata = {
  title: "Launchpad - Solana Token Launch Workstation",
  description:
    "Open-source, API-first workstation for launching Solana tokens on pump.fun, Raydium LaunchLab, and Meteora DBC. AI-powered draft generation, deterministic validation, client-side signing, multi-protocol support.",
  keywords: [
    "solana",
    "token launch",
    "pump.fun",
    "raydium",
    "meteora",
    "web3",
    "blockchain",
    "nextjs",
    "solana token creator"
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareSourceCode",
              name: "Launchpad",
              description:
                "API-first Solana token launch workstation supporting pump.fun, Raydium LaunchLab, and Meteora DBC. AI-powered draft generation, deterministic validation, client-side signing.",
              applicationCategory: "Developer Tools",
              operatingSystem: "macOS, Linux",
              programmingLanguage: "TypeScript",
              runtimePlatform: "Node.js, Next.js",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD"
              },
              keywords:
                "solana, token launch, pump.fun, raydium, meteora, web3, blockchain"
            })
          }}
        />
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
