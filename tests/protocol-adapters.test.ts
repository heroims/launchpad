import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicKey, SystemProgram, Transaction, type Connection } from "@solana/web3.js";
import { createProtocolAdapters, protocolAdapters } from "@/lib/launch/adapters";
import type { LaunchDraft } from "@/lib/launch/types";

const wallet = new PublicKey("11111111111111111111111111111111");

function draft(platform: LaunchDraft["platform"], firstBuyEnabled = true): LaunchDraft {
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
      enabled: firstBuyEnabled,
      amountSol: firstBuyEnabled ? 0.2 : 0,
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

  it("defaults to live pump.fun create-only SDK instructions instead of dry-run marker transfers", async () => {
    vi.stubEnv("PROTOCOL_SDK_MODE", "");

    const result = await protocolAdapters.pumpfun.buildInstructions(draft("pumpfun", false), wallet);

    expect(result.instructions).toHaveLength(1);
    expect(result.instructions[0].programId.equals(SystemProgram.programId)).toBe(false);
    expect(result.requiredSigners).toContain(wallet.toBase58());
    expect(result.summary).toContain("Adapter mode: live");
    expect(result.summary).toContain("SDK method: PumpSdk.createV2Instruction");
  });

  it("uses the default server-side Solana RPC URL for live Raydium builds when env is absent", async () => {
    vi.stubEnv("PROTOCOL_SDK_MODE", "live");
    vi.stubEnv("SOLANA_RPC_URL", "");
    vi.stubEnv("RAYDIUM_LAUNCHPAD_CONFIG_ID", "");
    vi.stubEnv("RAYDIUM_LAUNCHPAD_PLATFORM_ID", "");

    const createConnection = vi.fn((url: string) => ({ rpcEndpoint: url }) as unknown as Connection);
    const createLaunchpad = vi.fn(async () => ({
      transactions: [
        new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: wallet,
            toPubkey: PublicKey.unique(),
            lamports: 3
          })
        )
      ]
    }));
    const adapters = createProtocolAdapters({
      createConnection,
      loadRaydiumSdk: async () => ({
        LAUNCHPAD_CONFIG: PublicKey.unique(),
        LAUNCHPAD_PLATFORM: PublicKey.unique(),
        Raydium: {
          load: vi.fn(async () => ({
            launchpad: { createLaunchpad }
          }))
        },
        TxVersion: { LEGACY: "legacy" }
      })
    });

    await expect(adapters.raydium_launchlab.buildInstructions(draft("raydium_launchlab"), wallet)).resolves.toEqual(
      expect.objectContaining({ summary: expect.arrayContaining(["Adapter mode: live"]) })
    );
    expect(createConnection).toHaveBeenCalledWith("https://solana-rpc.publicnode.com", "confirmed");
  });

  it("uses Raydium LaunchLab SDK default config and platform ids when overrides are absent", async () => {
    vi.stubEnv("PROTOCOL_SDK_MODE", "live");
    vi.stubEnv("SOLANA_RPC_URL", "http://127.0.0.1:8899");
    vi.stubEnv("RAYDIUM_LAUNCHPAD_CONFIG_ID", "");
    vi.stubEnv("RAYDIUM_LAUNCHPAD_PLATFORM_ID", "");

    const defaultConfigId = PublicKey.unique();
    const defaultPlatformId = PublicKey.unique();
    const sdkInstruction = SystemProgram.transfer({
      fromPubkey: wallet,
      toPubkey: PublicKey.unique(),
      lamports: 5
    });
    const createLaunchpad = vi.fn(async () => ({
      transactions: [new Transaction().add(sdkInstruction)]
    }));
    const adapters = createProtocolAdapters({
      loadRaydiumSdk: async () => ({
        LAUNCHPAD_CONFIG: defaultConfigId,
        LAUNCHPAD_PLATFORM: defaultPlatformId,
        Raydium: {
          load: vi.fn(async () => ({
            launchpad: { createLaunchpad }
          }))
        },
        TxVersion: { LEGACY: "legacy" }
      })
    });

    const result = await adapters.raydium_launchlab.buildInstructions(draft("raydium_launchlab", false), wallet);

    expect(result.instructions).toEqual([sdkInstruction]);
    expect(createLaunchpad).toHaveBeenCalledWith(
      expect.objectContaining({
        configId: defaultConfigId,
        platformId: defaultPlatformId
      })
    );
  });

  it("provides a local Raydium LaunchLab config fallback so SDK API timeouts do not block construction", async () => {
    vi.stubEnv("PROTOCOL_SDK_MODE", "live");
    vi.stubEnv("SOLANA_RPC_URL", "http://127.0.0.1:8899");
    vi.stubEnv("RAYDIUM_LAUNCHPAD_CONFIG_ID", "");
    vi.stubEnv("RAYDIUM_LAUNCHPAD_PLATFORM_ID", "");

    const defaultConfigId = PublicKey.unique();
    const defaultPlatformId = PublicKey.unique();
    const remoteFetchLaunchConfigs = vi.fn(async () => {
      throw new Error("remote launch config timeout");
    });
    let fetchedConfigs: unknown;
    const sdkInstruction = SystemProgram.transfer({
      fromPubkey: wallet,
      toPubkey: PublicKey.unique(),
      lamports: 9
    });
    const raydiumInstance = {
      api: {
        fetchLaunchConfigs: remoteFetchLaunchConfigs
      },
      launchpad: {
        createLaunchpad: vi.fn(async () => {
          fetchedConfigs = await raydiumInstance.api.fetchLaunchConfigs();
          return { transactions: [new Transaction().add(sdkInstruction)] };
        })
      }
    };
    const adapters = createProtocolAdapters({
      loadRaydiumSdk: async () => ({
        LAUNCHPAD_CONFIG: defaultConfigId,
        LAUNCHPAD_PLATFORM: defaultPlatformId,
        Raydium: {
          load: vi.fn(async () => raydiumInstance)
        },
        TxVersion: { LEGACY: "legacy" }
      })
    });

    const result = await adapters.raydium_launchlab.buildInstructions(draft("raydium_launchlab", false), wallet);

    expect(result.instructions).toEqual([sdkInstruction]);
    expect(remoteFetchLaunchConfigs).not.toHaveBeenCalled();
    expect(fetchedConfigs).toEqual([
      expect.objectContaining({
        key: expect.objectContaining({ pubKey: defaultConfigId.toBase58() }),
        defaultParams: expect.objectContaining({
          supplyInit: expect.any(String),
          totalSellA: expect.any(String),
          totalFundRaisingB: expect.any(String)
        })
      })
    ]);
  });

  it("provides local Raydium WSOL token info so SDK token API timeouts do not delay construction", async () => {
    vi.stubEnv("PROTOCOL_SDK_MODE", "live");
    vi.stubEnv("SOLANA_RPC_URL", "http://127.0.0.1:8899");

    const remoteGetTokenInfo = vi.fn(async () => {
      throw new Error("remote token info timeout");
    });
    let tokenInfo: unknown;
    const sdkInstruction = SystemProgram.transfer({
      fromPubkey: wallet,
      toPubkey: PublicKey.unique(),
      lamports: 10
    });
    const raydiumInstance = {
      api: {
        fetchLaunchConfigs: vi.fn(async () => [])
      },
      token: {
        getTokenInfo: remoteGetTokenInfo
      },
      launchpad: {
        createLaunchpad: vi.fn(async () => {
          tokenInfo = await raydiumInstance.token.getTokenInfo("So11111111111111111111111111111111111111112");
          return { transactions: [new Transaction().add(sdkInstruction)] };
        })
      }
    };
    const adapters = createProtocolAdapters({
      loadRaydiumSdk: async () => ({
        LAUNCHPAD_CONFIG: PublicKey.unique(),
        LAUNCHPAD_PLATFORM: PublicKey.unique(),
        Raydium: {
          load: vi.fn(async () => raydiumInstance)
        },
        TxVersion: { LEGACY: "legacy" }
      })
    });

    const result = await adapters.raydium_launchlab.buildInstructions(draft("raydium_launchlab", false), wallet);

    expect(result.instructions).toEqual([sdkInstruction]);
    expect(remoteGetTokenInfo).not.toHaveBeenCalled();
    expect(tokenInfo).toEqual(
      expect.objectContaining({
        address: "So11111111111111111111111111111111111111112",
        decimals: 9,
        symbol: "WSOL"
      })
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

  it("builds Raydium LaunchLab create-only instructions from the SDK transaction and forwards extra configs", async () => {
    vi.stubEnv("PROTOCOL_SDK_MODE", "live");
    vi.stubEnv("SOLANA_RPC_URL", "http://127.0.0.1:8899");
    vi.stubEnv("RAYDIUM_LAUNCHPAD_CONFIG_ID", wallet.toBase58());
    vi.stubEnv("RAYDIUM_LAUNCHPAD_PLATFORM_ID", wallet.toBase58());

    const sdkInstruction = SystemProgram.transfer({
      fromPubkey: wallet,
      toPubkey: PublicKey.unique(),
      lamports: 7
    });
    const createLaunchpad = vi.fn(async () => ({
      transactions: [new Transaction().add(sdkInstruction)]
    }));
    const adapters = createProtocolAdapters({
      loadRaydiumSdk: async () => ({
        Raydium: {
          load: vi.fn(async () => ({
            launchpad: { createLaunchpad }
          }))
        },
        TxVersion: { LEGACY: "legacy" }
      })
    });
    const input = draft("raydium_launchlab", false);
    input.platformSpecificParams = {
      migrateType: "amm",
      extraConfigs: {
        curType: 1,
        totalFundRaisingB: "2500000000"
      }
    };

    const result = await adapters.raydium_launchlab.buildInstructions(input, wallet);

    expect(result.instructions).toEqual([sdkInstruction]);
    expect(result.requiredSigners).toContain(wallet.toBase58());
    expect(createLaunchpad).toHaveBeenCalledWith(
      expect.objectContaining({
        createOnly: true,
        migrateType: "amm",
        curType: 1,
        txVersion: "legacy"
      })
    );
    const args = createLaunchpad.mock.calls[0][0] as Record<string, { toString(): string }>;
    expect(args.buyAmount.toString()).toBe("0");
    expect(args.totalFundRaisingB.toString()).toBe("2500000000");
  });

  it("builds Raydium LaunchLab first-buy instructions with SDK buy amount and slippage", async () => {
    vi.stubEnv("PROTOCOL_SDK_MODE", "live");
    vi.stubEnv("SOLANA_RPC_URL", "http://127.0.0.1:8899");
    vi.stubEnv("RAYDIUM_LAUNCHPAD_CONFIG_ID", wallet.toBase58());
    vi.stubEnv("RAYDIUM_LAUNCHPAD_PLATFORM_ID", wallet.toBase58());

    const sdkInstruction = SystemProgram.transfer({
      fromPubkey: wallet,
      toPubkey: PublicKey.unique(),
      lamports: 11
    });
    const createLaunchpad = vi.fn(async () => ({
      builder: {
        allInstructions: [sdkInstruction]
      }
    }));
    const adapters = createProtocolAdapters({
      loadRaydiumSdk: async () => ({
        Raydium: {
          load: vi.fn(async () => ({
            launchpad: { createLaunchpad }
          }))
        },
        TxVersion: { LEGACY: "legacy" }
      })
    });

    const result = await adapters.raydium_launchlab.buildInstructions(draft("raydium_launchlab", true), wallet);

    expect(result.instructions).toEqual([sdkInstruction]);
    expect(createLaunchpad).toHaveBeenCalledWith(expect.objectContaining({ createOnly: false }));
    const args = createLaunchpad.mock.calls[0][0] as Record<string, { toString(): string }>;
    expect(args.buyAmount.toString()).toBe("200000000");
    expect(args.slippage.toString()).toBe("100");
  });

  it("builds Meteora DBC create-only and first-buy instructions through pool SDK methods", async () => {
    vi.stubEnv("PROTOCOL_SDK_MODE", "live");
    vi.stubEnv("SOLANA_RPC_URL", "http://127.0.0.1:8899");
    vi.stubEnv("METEORA_DBC_CONFIG_ID", wallet.toBase58());

    const createOnlyInstruction = SystemProgram.transfer({
      fromPubkey: wallet,
      toPubkey: PublicKey.unique(),
      lamports: 13
    });
    const firstBuyInstruction = SystemProgram.transfer({
      fromPubkey: wallet,
      toPubkey: PublicKey.unique(),
      lamports: 17
    });
    const createPool = vi.fn(async () => new Transaction().add(createOnlyInstruction));
    const createPoolWithFirstBuy = vi.fn(async () => new Transaction().add(firstBuyInstruction));
    const adapters = createProtocolAdapters({
      loadMeteoraSdk: async () => ({
        DynamicBondingCurveClient: class {
          pool = { createPool, createPoolWithFirstBuy };
        }
      })
    });

    const createOnlyResult = await adapters.meteora_dbc.buildInstructions(draft("meteora_dbc", false), wallet);
    const firstBuyDraft = draft("meteora_dbc", true);
    firstBuyDraft.platformSpecificParams = { minimumAmountOut: "123" };
    const firstBuyResult = await adapters.meteora_dbc.buildInstructions(firstBuyDraft, wallet);

    expect(createOnlyResult.instructions).toEqual([createOnlyInstruction]);
    expect(firstBuyResult.instructions).toEqual([firstBuyInstruction]);
    expect(createPool).toHaveBeenCalledWith(expect.objectContaining({ payer: wallet, poolCreator: wallet }));
    expect(createPoolWithFirstBuy).toHaveBeenCalledWith(
      expect.objectContaining({
        firstBuyParam: expect.objectContaining({
          buyer: wallet,
          receiver: wallet,
          referralTokenAccount: null
        })
      })
    );
    const args = createPoolWithFirstBuy.mock.calls[0][0] as {
      firstBuyParam: Record<string, { toString(): string }>;
    };
    expect(args.firstBuyParam.buyAmount.toString()).toBe("200000000");
    expect(args.firstBuyParam.minimumAmountOut.toString()).toBe("123");
  });
});
