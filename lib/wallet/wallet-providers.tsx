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
    const msg = error.message ?? "";
    if (
      error.name === "WalletConnectionError" ||
      error.name === "WalletDisconnectedError" ||
      error.name === "WalletNotSelectedError" ||
      error.name === "WalletNotReadyError" ||
      error.name === "WalletLoadError" ||
      error.name === "WalletConfigError" ||
      error.name === "WalletWindowBlockedError" ||
      error.name === "WalletWindowClosedError" ||
      msg.includes("User rejected") ||
      msg.includes("cancelled") ||
      msg.includes("canceled") ||
      msg.includes("not found") ||
      msg.includes("not installed") ||
      msg.includes("wallet not") ||
      msg.includes("Cannot read properties of undefined") ||
      msg.includes("extension")
    ) {
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
