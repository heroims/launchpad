"use client";

import { useState, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (wallet.connected || wallet.connecting) setOpen(false);
  }, [wallet.connected, wallet.connecting]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleClick() {
    if (wallet.connected) {
      setOpen((prev) => !prev);
      return;
    }
    if (wallet.connecting) return;
    setVisible(true);
  }

  async function handleDisconnect() {
    setOpen(false);
    try {
      await wallet.disconnect();
    } catch {
      wallet.select(null);
    }
  }

  const label = wallet.wallet?.adapter.name ?? null;

  return (
    <div className="wallet-adapter-dropdown" ref={dropdownRef}>
      <button
        className={`wallet-adapter-button${!wallet.connected && !wallet.connecting ? " wallet-adapter-button-trigger" : ""}`}
        onClick={handleClick}
        disabled={wallet.connecting}
      >
        {wallet.connecting ? "Connecting…" : wallet.connected && wallet.publicKey ? `${label ?? "Wallet"}: ${wallet.publicKey.toBase58().slice(0, 4)}…${wallet.publicKey.toBase58().slice(-4)}` : "Select Wallet"}
      </button>
      {wallet.connected && open ? (
        <ul className="wallet-adapter-dropdown-list wallet-adapter-dropdown-list-active">
          <li>
            <button className="wallet-adapter-dropdown-list-item" onClick={handleDisconnect}>
              Disconnect
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
