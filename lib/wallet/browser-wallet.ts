export type WalletPublicKeyLike =
  | string
  | { toBase58: () => string }
  | { toString: () => string };

export type WalletConnection = {
  label: string;
  address: string;
  connected: true;
};

export function publicKeyToString(publicKey: WalletPublicKeyLike | null | undefined): string | null {
  if (!publicKey) return null;
  if (typeof publicKey === "string") return publicKey;
  if ("toBase58" in publicKey && typeof publicKey.toBase58 === "function") return publicKey.toBase58();
  return publicKey.toString();
}
