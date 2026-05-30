import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { getProtocolSdkDescriptor, getProtocolSdkMethod } from "./protocol-sdks";
import type { LaunchDraft, LaunchPlatform } from "./types";

export type ProtocolAdapterOutput = {
  instructions: TransactionInstruction[];
  requiredSigners: string[];
  summary: string[];
};

export type ProtocolAdapter = {
  platform: LaunchPlatform;
  buildInstructions(draft: LaunchDraft, wallet: PublicKey): ProtocolAdapterOutput;
};

function markerInstruction(platform: LaunchPlatform, draft: LaunchDraft, wallet: PublicKey): TransactionInstruction {
  const markerLamports = 1;
  const seed = `${platform}:${draft.tokenSymbol}:${draft.templateVersion}:${draft.mintPublicKey}`;
  return SystemProgram.transfer({
    fromPubkey: wallet,
    toPubkey: wallet,
    lamports: markerLamports + (seed.length % 7)
  });
}

function adapter(platform: LaunchPlatform, label: string): ProtocolAdapter {
  return {
    platform,
    buildInstructions(draft, wallet) {
      const descriptor = getProtocolSdkDescriptor(platform);
      const sdkMethod = getProtocolSdkMethod(platform, !!draft.firstBuy?.enabled);
      return {
        instructions: [markerInstruction(platform, draft, wallet)],
        requiredSigners: descriptor.requiresMintSigner ? [draft.mintPublicKey] : [],
        summary: [
          `${label} launch template ${draft.templateVersion}`,
          `SDK package: ${descriptor.packageName}`,
          `SDK method: ${sdkMethod}`,
          `Mint: ${draft.mintPublicKey}`,
          `Prepare token ${draft.tokenSymbol} with ${draft.initialBudgetSol} SOL initial budget`,
          draft.firstBuy?.enabled ? `First buy: ${draft.firstBuy.amountSol} SOL` : "First buy: disabled",
          "Protocol-specific pool instructions are isolated behind this adapter boundary"
        ]
      };
    }
  };
}

export const protocolAdapters: Record<LaunchPlatform, ProtocolAdapter> = {
  pumpfun: adapter("pumpfun", "pump.fun"),
  raydium_launchlab: adapter("raydium_launchlab", "Raydium LaunchLab"),
  meteora_dbc: adapter("meteora_dbc", "Meteora DBC")
};
