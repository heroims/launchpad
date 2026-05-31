import { describe, expect, it, vi } from "vitest";
import { connectSolanaWallet, disconnectSolanaWallet, findSolanaWalletProvider, getWalletDetectionMessage } from "@/lib/wallet/browser-wallet";

function publicKey(value: string) {
  return {
    toBase58: () => value
  };
}

describe("browser wallet adapter", () => {
  it("prefers a detected Phantom provider from window.solana", () => {
    const provider = {
      isPhantom: true,
      publicKey: publicKey("phantom-address")
    };

    const result = findSolanaWalletProvider({ solana: provider });

    expect(result?.label).toBe("Phantom");
    expect(result?.provider).toBe(provider);
  });

  it("connects to the provider and returns the wallet public key", async () => {
    const provider = {
      isSolflare: true,
      connect: vi.fn(async () => ({ publicKey: publicKey("solflare-address") }))
    };

    const result = await connectSolanaWallet({ provider, label: "Solflare" });

    expect(provider.connect).toHaveBeenCalledWith({ onlyIfTrusted: false });
    expect(result.address).toBe("solflare-address");
    expect(result.label).toBe("Solflare");
  });

  it("throws a useful error when no Solana browser wallet exists", async () => {
    await expect(connectSolanaWallet(null)).rejects.toThrow("No Solana browser wallet detected");
  });

  it("explains when the browser has no injected Solana wallet", () => {
    expect(getWalletDetectionMessage(null)).toContain("没有检测到 Phantom/Solflare");
  });

  it("disconnects wallets that expose a disconnect method", async () => {
    const provider = {
      disconnect: vi.fn(async () => undefined)
    };

    await disconnectSolanaWallet({ provider, label: "Phantom" });

    expect(provider.disconnect).toHaveBeenCalled();
  });
});
