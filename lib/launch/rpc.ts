export const DEFAULT_SOLANA_RPC_URL = "https://solana-rpc.publicnode.com";

export function resolveSolanaRpcUrl(value = process.env.SOLANA_RPC_URL): string {
  return value?.trim() || DEFAULT_SOLANA_RPC_URL;
}
