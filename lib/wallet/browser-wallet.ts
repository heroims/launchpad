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
  signTransaction?: <T>(transaction: T) => Promise<T>;
  signAllTransactions?: <T>(transactions: T[]) => Promise<T[]>;
  signAndSendTransaction?: <T>(transaction: T) => Promise<string | { signature?: string }>;
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

export function getWalletDetectionMessage(wallet: DetectedSolanaWallet | null): string {
  if (!wallet) {
    return "没有检测到 Phantom/Solflare 钱包扩展。请使用已安装钱包扩展的浏览器打开，或安装后点击重新检测。";
  }

  if (!wallet.provider.signAndSendTransaction) {
    return `${wallet.label} 已检测到，但当前钱包不支持签名并发送交易。请升级钱包扩展，或换用支持 signAndSendTransaction 的钱包。`;
  }

  return `${wallet.label} 已检测到，请先连接钱包。`;
}

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
