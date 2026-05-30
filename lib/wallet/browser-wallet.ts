export type WalletPublicKeyLike =
  | string
  | {
      toBase58: () => string;
    }
  | {
      toString: () => string;
    };

export type SolanaBrowserWalletProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: WalletPublicKeyLike | null;
  connect?: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: WalletPublicKeyLike | null } | void>;
  disconnect?: () => Promise<void> | void;
  on?: (event: "accountChanged" | "disconnect", handler: (...args: unknown[]) => void) => void;
  off?: (event: "accountChanged" | "disconnect", handler: (...args: unknown[]) => void) => void;
};

export type DetectedSolanaWallet = {
  label: "Phantom" | "Solflare" | "Solana Wallet";
  provider: SolanaBrowserWalletProvider;
};

export type WalletConnection = {
  label: DetectedSolanaWallet["label"];
  address: string;
  connected: true;
};

export type BrowserWalletGlobal = {
  solana?: SolanaBrowserWalletProvider;
  phantom?: {
    solana?: SolanaBrowserWalletProvider;
  };
  solflare?: SolanaBrowserWalletProvider;
};

export function publicKeyToString(publicKey: WalletPublicKeyLike | null | undefined): string | null {
  if (!publicKey) return null;
  if (typeof publicKey === "string") return publicKey;
  if ("toBase58" in publicKey && typeof publicKey.toBase58 === "function") return publicKey.toBase58();
  return publicKey.toString();
}

function walletLabel(provider: SolanaBrowserWalletProvider): DetectedSolanaWallet["label"] {
  if (provider.isPhantom) return "Phantom";
  if (provider.isSolflare) return "Solflare";
  return "Solana Wallet";
}

export function findSolanaWalletProvider(source: BrowserWalletGlobal = globalThis as BrowserWalletGlobal): DetectedSolanaWallet | null {
  const candidates = [source.phantom?.solana, source.solflare, source.solana].filter(Boolean) as SolanaBrowserWalletProvider[];

  const unique = candidates.filter((provider, index) => candidates.indexOf(provider) === index);
  const provider = unique.find((candidate) => candidate.isPhantom) ?? unique.find((candidate) => candidate.isSolflare) ?? unique[0];

  if (!provider) return null;
  return {
    label: walletLabel(provider),
    provider
  };
}

export async function connectSolanaWallet(wallet: DetectedSolanaWallet | null): Promise<WalletConnection> {
  if (!wallet) {
    throw new Error("No Solana browser wallet detected");
  }

  const response = await wallet.provider.connect?.({ onlyIfTrusted: false });
  const address = publicKeyToString(response?.publicKey ?? wallet.provider.publicKey);
  if (!address) {
    throw new Error("Wallet connected but did not return a public key");
  }

  return {
    label: wallet.label,
    address,
    connected: true
  };
}

export async function disconnectSolanaWallet(wallet: DetectedSolanaWallet | null): Promise<void> {
  await wallet?.provider.disconnect?.();
}
