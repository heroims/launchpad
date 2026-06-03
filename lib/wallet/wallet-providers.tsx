"use client";

import { useCallback, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  CoinbaseWalletAdapter,
  TrustWalletAdapter,
  BitKeepWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import type { ReactNode } from "react";

import "@solana/wallet-adapter-react-ui/styles.css";
import { DEFAULT_SOLANA_RPC_URL } from "@/lib/launch/rpc";

const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_SOLANA_RPC_URL;

export function WalletProviders({ children }: { children: ReactNode }) {
  const onError = useCallback((error: Error) => {
    if (error.name === "WalletConnectionError" || error.name === "WalletDisconnectedError" || error.message?.includes("User rejected") || error.message?.includes("cancelled") || error.message?.includes("canceled")) {
      return;
    }
    console.error(error);
  }, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new TrustWalletAdapter(),
      new BitKeepWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
