import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { protocolAdapters } from "@/lib/launch/adapters";
import type { LaunchDraft } from "@/lib/launch/types";

const wallet = new PublicKey("11111111111111111111111111111111");

function draft(platform: LaunchDraft["platform"]): LaunchDraft {
  return {
    platform,
    walletAddress: wallet.toBase58(),
    mintPublicKey: wallet.toBase58(),
    tokenName: "Launch Token",
    tokenSymbol: "LAUNCH",
    tokenMetadata: {
      description: "A test launch",
      imageUri: "https://example.com/token.png",
      metadataUri: "https://example.com/metadata.json"
    },
    initialBudgetSol: 1,
    firstBuy: {
      enabled: true,
      amountSol: 0.2,
      slippageBps: 100
    },
    templateVersion: "v1",
    platformSpecificParams: {}
  };
}

describe("protocol adapters", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to dry-run mode with marker instructions", async () => {
    vi.stubEnv("PROTOCOL_SDK_MODE", "");

    const result = await protocolAdapters.pumpfun.buildInstructions(draft("pumpfun"), wallet);

    expect(result.instructions).toHaveLength(1);
    expect(result.requiredSigners).toContain(wallet.toBase58());
    expect(result.summary).toContain("Adapter mode: dry-run");
  });

  it("requires live adapter configuration before using protocol SDKs", async () => {
    vi.stubEnv("PROTOCOL_SDK_MODE", "live");
    vi.stubEnv("SOLANA_RPC_URL", "");
    vi.stubEnv("RAYDIUM_LAUNCHPAD_CONFIG_ID", "");
    vi.stubEnv("RAYDIUM_LAUNCHPAD_PLATFORM_ID", "");

    await expect(protocolAdapters.raydium_launchlab.buildInstructions(draft("raydium_launchlab"), wallet)).rejects.toThrow(
      /Missing live adapter config: SOLANA_RPC_URL, RAYDIUM_LAUNCHPAD_CONFIG_ID, RAYDIUM_LAUNCHPAD_PLATFORM_ID/
    );
  });

  it("requires a deterministic Meteora minimum amount out for live first-buy builds", async () => {
    vi.stubEnv("PROTOCOL_SDK_MODE", "live");
    vi.stubEnv("SOLANA_RPC_URL", "http://127.0.0.1:8899");
    vi.stubEnv("METEORA_DBC_CONFIG_ID", wallet.toBase58());

    await expect(protocolAdapters.meteora_dbc.buildInstructions(draft("meteora_dbc"), wallet)).rejects.toThrow(
      /Meteora DBC live first buy requires platformSpecificParams.minimumAmountOut/
    );
  });
});
