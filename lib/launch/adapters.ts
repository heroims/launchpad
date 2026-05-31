import { createRequire } from "module";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { getProtocolSdkDescriptor, getProtocolSdkMethod } from "./protocol-sdks";
import type { LaunchDraft, LaunchPlatform } from "./types";

const nodeRequire = createRequire(import.meta.url);

type ProtocolSdkMode = "dry-run" | "live";

export type ProtocolAdapterOutput = {
  instructions: TransactionInstruction[];
  requiredSigners: string[];
  summary: string[];
};

export type ProtocolAdapter = {
  platform: LaunchPlatform;
  buildInstructions(draft: LaunchDraft, wallet: PublicKey): Promise<ProtocolAdapterOutput>;
};

type PumpSdkModule = {
  PumpSdk: new () => {
    createV2Instruction(args: Record<string, unknown>): Promise<TransactionInstruction>;
    createV2AndBuyInstructions(args: Record<string, unknown>): Promise<TransactionInstruction[]>;
  };
  OnlinePumpSdk: new (connection: Connection) => {
    fetchGlobal(): Promise<unknown>;
    fetchFeeConfig(): Promise<unknown>;
  };
  getBuyTokenAmountFromSolAmount(args: Record<string, unknown>): unknown;
};

type BnConstructor = new (value: string | number) => {
  toString(): string;
};

export function getProtocolSdkMode(): ProtocolSdkMode {
  const mode = (process.env.PROTOCOL_SDK_MODE || "live").trim().toLowerCase();
  if (mode === "dry-run" || mode === "live") return mode;
  throw new Error(`Unsupported PROTOCOL_SDK_MODE: ${process.env.PROTOCOL_SDK_MODE}`);
}

function requireEnv(names: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  const missing: string[] = [];

  for (const name of names) {
    const value = process.env[name]?.trim();
    if (!value) {
      missing.push(name);
    } else {
      values[name] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing live adapter config: ${missing.join(", ")}`);
  }

  return values;
}

function solToLamportsBn(amountSol: number): InstanceType<BnConstructor> {
  const BN = nodeRequire("bn.js") as BnConstructor;
  return new BN(Math.round(amountSol * LAMPORTS_PER_SOL).toString()) as InstanceType<BnConstructor>;
}

function integerBn(value: number): InstanceType<BnConstructor> {
  const BN = nodeRequire("bn.js") as BnConstructor;
  return new BN(Math.round(value).toString()) as InstanceType<BnConstructor>;
}

function metadataUri(draft: LaunchDraft): string {
  return draft.tokenMetadata.metadataUri || draft.tokenMetadata.imageUri;
}

function boolParam(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function txInstructions(transaction: unknown): TransactionInstruction[] {
  if (transaction instanceof Transaction) return transaction.instructions;
  if (transaction && typeof transaction === "object" && Array.isArray((transaction as Transaction).instructions)) {
    return (transaction as Transaction).instructions;
  }
  return [];
}

function collectSdkInstructions(value: unknown): TransactionInstruction[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectSdkInstructions(item));
  if (value instanceof Transaction || (typeof value === "object" && Array.isArray((value as Transaction).instructions))) {
    return txInstructions(value);
  }
  if (typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    return [
      ...collectSdkInstructions(candidate.transaction),
      ...collectSdkInstructions(candidate.transactions),
      ...collectSdkInstructions(candidate.createPoolWithFirstBuyTx),
      ...collectSdkInstructions(candidate.createConfigTx)
    ];
  }
  return [];
}

function markerInstruction(platform: LaunchPlatform, draft: LaunchDraft, wallet: PublicKey): TransactionInstruction {
  const markerLamports = 1;
  const seed = `${platform}:${draft.tokenSymbol}:${draft.templateVersion}:${draft.mintPublicKey}`;
  return SystemProgram.transfer({
    fromPubkey: wallet,
    toPubkey: wallet,
    lamports: markerLamports + (seed.length % 7)
  });
}

function dryRunInstructions(platform: LaunchPlatform, label: string, draft: LaunchDraft, wallet: PublicKey): ProtocolAdapterOutput {
  const descriptor = getProtocolSdkDescriptor(platform);
  const sdkMethod = getProtocolSdkMethod(platform, !!draft.firstBuy?.enabled);
  return {
    instructions: [markerInstruction(platform, draft, wallet)],
    requiredSigners: descriptor.requiresMintSigner ? [draft.mintPublicKey] : [],
    summary: [
      "Adapter mode: dry-run",
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

async function pumpFunLiveInstructions(draft: LaunchDraft, wallet: PublicKey): Promise<TransactionInstruction[]> {
  const sdkModule = nodeRequire("@pump-fun/pump-sdk") as PumpSdkModule;
  const sdk = new sdkModule.PumpSdk();
  const mint = new PublicKey(draft.mintPublicKey);
  const mayhemMode = boolParam(draft.platformSpecificParams.mayhemMode, false);
  const cashback = boolParam(draft.platformSpecificParams.cashback, false);

  if (!draft.firstBuy?.enabled) {
    return [
      await sdk.createV2Instruction({
        mint,
        name: draft.tokenName,
        symbol: draft.tokenSymbol,
        uri: metadataUri(draft),
        creator: wallet,
        user: wallet,
        mayhemMode,
        cashback,
        quoteMint: NATIVE_MINT
      })
    ];
  }

  const { SOLANA_RPC_URL } = requireEnv(["SOLANA_RPC_URL"]);
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const onlineSdk = new sdkModule.OnlinePumpSdk(connection);
  const global = await onlineSdk.fetchGlobal();
  const feeConfig = await onlineSdk.fetchFeeConfig().catch(() => null);
  const solAmount = solToLamportsBn(draft.firstBuy.amountSol);
  const amount = sdkModule.getBuyTokenAmountFromSolAmount({
    global,
    feeConfig,
    mintSupply: null,
    bondingCurve: null,
    amount: solAmount,
    quoteMint: NATIVE_MINT
  });

  return sdk.createV2AndBuyInstructions({
    global,
    mint,
    name: draft.tokenName,
    symbol: draft.tokenSymbol,
    uri: metadataUri(draft),
    creator: wallet,
    user: wallet,
    amount,
    solAmount,
    mayhemMode,
    cashback
  });
}

async function raydiumLiveInstructions(draft: LaunchDraft, wallet: PublicKey): Promise<TransactionInstruction[]> {
  const { SOLANA_RPC_URL, RAYDIUM_LAUNCHPAD_CONFIG_ID, RAYDIUM_LAUNCHPAD_PLATFORM_ID } = requireEnv([
    "SOLANA_RPC_URL",
    "RAYDIUM_LAUNCHPAD_CONFIG_ID",
    "RAYDIUM_LAUNCHPAD_PLATFORM_ID"
  ]);
  const { Raydium, TxVersion } = await import("@raydium-io/raydium-sdk-v2");
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const raydium = await Raydium.load({
    connection,
    owner: wallet,
    disableFeatureCheck: true,
    disableLoadToken: true
  });
  const buyAmount = solToLamportsBn(draft.firstBuy?.enabled ? draft.firstBuy.amountSol : 0);

  const result = await raydium.launchpad.createLaunchpad({
    configId: new PublicKey(RAYDIUM_LAUNCHPAD_CONFIG_ID),
    platformId: new PublicKey(RAYDIUM_LAUNCHPAD_PLATFORM_ID),
    mintA: new PublicKey(draft.mintPublicKey),
    name: draft.tokenName,
    symbol: draft.tokenSymbol,
    uri: metadataUri(draft),
    migrateType: (draft.platformSpecificParams.migrateType as "amm" | "cpmm" | undefined) ?? "cpmm",
    buyAmount,
    slippage: integerBn(draft.firstBuy?.slippageBps ?? 0),
    txVersion: TxVersion.LEGACY,
    feePayer: wallet,
    createOnly: !draft.firstBuy?.enabled
  });

  return collectSdkInstructions(result);
}

async function meteoraLiveInstructions(draft: LaunchDraft, wallet: PublicKey): Promise<TransactionInstruction[]> {
  const { SOLANA_RPC_URL, METEORA_DBC_CONFIG_ID } = requireEnv(["SOLANA_RPC_URL", "METEORA_DBC_CONFIG_ID"]);
  const { DynamicBondingCurveClient } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const client = new DynamicBondingCurveClient(connection, "confirmed");
  const createPoolParam = {
    baseMint: new PublicKey(draft.mintPublicKey),
    config: new PublicKey(METEORA_DBC_CONFIG_ID),
    name: draft.tokenName,
    symbol: draft.tokenSymbol,
    uri: metadataUri(draft),
    payer: wallet,
    poolCreator: wallet
  };

  if (!draft.firstBuy?.enabled) {
    return collectSdkInstructions(await client.pool.createPool(createPoolParam));
  }

  if (draft.platformSpecificParams.minimumAmountOut === undefined) {
    throw new Error(
      "Meteora DBC live first buy requires platformSpecificParams.minimumAmountOut until server-side quote calculation is wired."
    );
  }

  const minimumAmountOut = integerBn(Number(draft.platformSpecificParams.minimumAmountOut));
  return collectSdkInstructions(
    await client.pool.createPoolWithFirstBuy({
      createPoolParam,
      firstBuyParam: {
        buyer: wallet,
        receiver: wallet,
        buyAmount: solToLamportsBn(draft.firstBuy.amountSol),
        minimumAmountOut,
        referralTokenAccount: null
      }
    })
  );
}

async function liveInstructions(platform: LaunchPlatform, draft: LaunchDraft, wallet: PublicKey): Promise<TransactionInstruction[]> {
  if (platform === "pumpfun") return pumpFunLiveInstructions(draft, wallet);
  if (platform === "raydium_launchlab") return raydiumLiveInstructions(draft, wallet);
  return meteoraLiveInstructions(draft, wallet);
}

function adapter(platform: LaunchPlatform, label: string): ProtocolAdapter {
  return {
    platform,
    async buildInstructions(draft, wallet) {
      const mode = getProtocolSdkMode();
      if (mode === "dry-run") return dryRunInstructions(platform, label, draft, wallet);

      const descriptor = getProtocolSdkDescriptor(platform);
      const sdkMethod = getProtocolSdkMethod(platform, !!draft.firstBuy?.enabled);
      const instructions = await liveInstructions(platform, draft, wallet);
      if (instructions.length === 0) {
        throw new Error(`${label} SDK returned no launch instructions.`);
      }

      return {
        instructions,
        requiredSigners: descriptor.requiresMintSigner ? [draft.mintPublicKey] : [],
        summary: [
          "Adapter mode: live",
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
