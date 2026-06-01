import { Connection } from "@solana/web3.js";

type ResolveBuildRecentBlockhashInput = {
  requestedBlockhash?: unknown;
  rpcUrl?: string;
  fetchBlockhash?: (rpcUrl: string) => Promise<string>;
};

async function fetchRecentBlockhashFromRpc(rpcUrl: string): Promise<string> {
  const connection = new Connection(rpcUrl, "confirmed");
  const latest = await connection.getLatestBlockhash("confirmed");
  return latest.blockhash;
}

export async function resolveBuildRecentBlockhash(input: ResolveBuildRecentBlockhashInput): Promise<string | undefined> {
  if (typeof input.requestedBlockhash === "string" && input.requestedBlockhash.trim()) {
    return input.requestedBlockhash.trim();
  }

  const rpcUrl = input.rpcUrl?.trim();
  if (!rpcUrl) return undefined;

  const fetchBlockhash = input.fetchBlockhash ?? fetchRecentBlockhashFromRpc;
  try {
    return await fetchBlockhash(rpcUrl);
  } catch {
    return undefined;
  }
}
