import { createRequire } from "module";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getProtocolSdkDescriptor, getProtocolSdkMethod } from "./protocol-sdks";
import { resolveSolanaRpcUrl } from "./rpc";
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

type RaydiumSdkModule = {
  LAUNCHPAD_CONFIG?: PublicKey;
  LAUNCHPAD_PLATFORM?: PublicKey;
  LAUNCHPAD_PROGRAM?: PublicKey;
  getPdaLaunchpadConfigId?: (
    programId: PublicKey,
    mintB: PublicKey,
    curveType: number,
    index: number
  ) => { publicKey: PublicKey };
  Raydium: {
    load(config: Record<string, unknown>): Promise<{
      api?: {
        fetchLaunchConfigs?: () => Promise<unknown[]>;
      };
      token?: {
        getTokenInfo?: (mint: string | PublicKey) => Promise<unknown>;
      };
      launchpad: {
        createLaunchpad(args: Record<string, unknown>): Promise<unknown>;
      };
    }>;
  };
  TxVersion: {
    LEGACY: unknown;
  };
};

type MeteoraSdkModule = {
  DynamicBondingCurveClient: {
    new (connection: Connection, commitment: "confirmed"): {
      pool: {
        createPool(params: Record<string, unknown>): Promise<unknown>;
        createPoolWithFirstBuy(params: Record<string, unknown>): Promise<unknown>;
      };
    };
    create?: (connection: Connection, commitment?: "confirmed") => {
      pool: {
        createPool(params: Record<string, unknown>): Promise<unknown>;
        createPoolWithFirstBuy(params: Record<string, unknown>): Promise<unknown>;
      };
    };
  };
};

export type ProtocolAdapterDependencies = {
  createConnection(url: string, commitment: "confirmed"): Connection;
  loadPumpSdk(): PumpSdkModule;
  loadRaydiumSdk(): Promise<RaydiumSdkModule>;
  loadMeteoraSdk(): Promise<MeteoraSdkModule>;
};

const defaultDependencies: ProtocolAdapterDependencies = {
  createConnection: (url, commitment) => new Connection(url, commitment),
  loadPumpSdk: () => nodeRequire("@pump-fun/pump-sdk") as PumpSdkModule,
  loadRaydiumSdk: () => import("@raydium-io/raydium-sdk-v2") as unknown as Promise<RaydiumSdkModule>,
  loadMeteoraSdk: () => import("@meteora-ag/dynamic-bonding-curve-sdk") as unknown as Promise<MeteoraSdkModule>
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

function bnFromValue(value: unknown): InstanceType<BnConstructor> {
  if (value && typeof value === "object" && "toString" in value) {
    const BN = nodeRequire("bn.js") as BnConstructor;
    return new BN((value as { toString(): string }).toString()) as InstanceType<BnConstructor>;
  }
  if (typeof value === "number") return integerBn(value);
  const BN = nodeRequire("bn.js") as BnConstructor;
  return new BN(String(value)) as InstanceType<BnConstructor>;
}

function metadataUri(draft: LaunchDraft): string {
  return draft.tokenMetadata.metadataUri || draft.tokenMetadata.imageUri;
}

function boolParam(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function optionalPublicKeyEnv(name: string): PublicKey | undefined {
  const value = process.env[name]?.trim();
  return value ? new PublicKey(value) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isInstruction(value: unknown): value is TransactionInstruction {
  return (
    value instanceof TransactionInstruction ||
    (isRecord(value) && value.programId instanceof PublicKey && Array.isArray(value.keys) && value.data !== undefined)
  );
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
  if (isInstruction(value)) return [value];
  if (typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    const transactionInstructions = [
      ...collectSdkInstructions(candidate.transaction),
      ...collectSdkInstructions(candidate.transactions),
      ...collectSdkInstructions(candidate.createPoolWithFirstBuyTx),
      ...collectSdkInstructions(candidate.createConfigTx)
    ];
    if (transactionInstructions.length > 0) return transactionInstructions;

    const builder = isRecord(candidate.builder) ? candidate.builder : undefined;
    const builderData = builder && isRecord(builder.AllTxData) ? builder.AllTxData : undefined;
    return [
      ...collectSdkInstructions(candidate.instruction),
      ...collectSdkInstructions(candidate.instructions),
      ...collectSdkInstructions(candidate.innerTransactions),
      ...collectSdkInstructions(builder?.allInstructions),
      ...collectSdkInstructions(builderData?.instructions),
      ...collectSdkInstructions(builderData?.endInstructions)
    ];
  }
  return [];
}

function normalizeRaydiumExtraConfigs(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};

  const bnFields = new Set([
    "supply",
    "totalSellA",
    "totalFundRaisingB",
    "totalLockedAmount",
    "cliffPeriod",
    "unlockPeriod",
    "shareFeeRate",
    "platformFeeRate",
    "platformVestingScale"
  ]);
  const publicKeyFields = new Set(["shareFeeReceiver"]);

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null && fieldValue !== "")
      .map(([fieldName, fieldValue]) => {
        if (bnFields.has(fieldName)) return [fieldName, bnFromValue(fieldValue)];
        if (publicKeyFields.has(fieldName)) return [fieldName, new PublicKey(String(fieldValue))];
        return [fieldName, fieldValue];
      })
  );
}

function resolveRaydiumConfigId(sdk: RaydiumSdkModule): PublicKey {
  const override = optionalPublicKeyEnv("RAYDIUM_LAUNCHPAD_CONFIG_ID");
  if (override) return override;
  if (sdk.LAUNCHPAD_CONFIG) return sdk.LAUNCHPAD_CONFIG;
  if (sdk.LAUNCHPAD_PROGRAM && sdk.getPdaLaunchpadConfigId) {
    return sdk.getPdaLaunchpadConfigId(sdk.LAUNCHPAD_PROGRAM, NATIVE_MINT, 0, 0).publicKey;
  }

  throw new Error(
    "Raydium LaunchLab configId could not be resolved from SDK defaults. Set RAYDIUM_LAUNCHPAD_CONFIG_ID."
  );
}

function resolveRaydiumPlatformId(sdk: RaydiumSdkModule): PublicKey | undefined {
  return optionalPublicKeyEnv("RAYDIUM_LAUNCHPAD_PLATFORM_ID") ?? sdk.LAUNCHPAD_PLATFORM;
}

function raydiumFallbackLaunchConfig(configId: PublicKey): Record<string, unknown> {
  return {
    key: {
      name: "Default SOL config",
      pubKey: configId.toBase58(),
      epoch: 0,
      curveType: 0,
      index: 0,
      migrateFee: "0",
      tradeFeeRate: "0",
      maxShareFeeRate: "0",
      minSupplyA: "0",
      maxLockRate: "0",
      minSellRateA: "0",
      minMigrateRateA: "0",
      minFundRaisingB: "0",
      protocolFeeOwner: PublicKey.default.toBase58(),
      migrateFeeOwner: PublicKey.default.toBase58(),
      migrateToAmmWallet: PublicKey.default.toBase58(),
      migrateToCpmmWallet: PublicKey.default.toBase58(),
      mintB: NATIVE_MINT.toBase58()
    },
    defaultParams: {
      supplyInit: "1000000000000000",
      totalSellA: "793100000000000",
      totalFundRaisingB: "85000000000"
    }
  };
}

function installRaydiumLaunchConfigFallback(
  raydium: { api?: { fetchLaunchConfigs?: () => Promise<unknown[]> } },
  configId: PublicKey
) {
  if (!raydium.api) return;
  raydium.api.fetchLaunchConfigs = async () => [raydiumFallbackLaunchConfig(configId)];
}

function raydiumWsolTokenInfo(): Record<string, unknown> {
  return {
    chainId: 101,
    address: NATIVE_MINT.toBase58(),
    programId: TOKEN_PROGRAM_ID.toBase58(),
    decimals: 9,
    symbol: "WSOL",
    name: "Wrapped SOL",
    logoURI: "https://img-v1.raydium.io/icon/So11111111111111111111111111111111111111112.png",
    tags: [],
    priority: 2,
    type: "raydium",
    extensions: { coingeckoId: "solana" }
  };
}

function installRaydiumTokenInfoFallback(raydium: {
  token?: { getTokenInfo?: (mint: string | PublicKey) => Promise<unknown> };
}) {
  if (!raydium.token) return;
  const originalGetTokenInfo = raydium.token.getTokenInfo?.bind(raydium.token);
  raydium.token.getTokenInfo = async (mint) => {
    const mintKey = typeof mint === "string" ? new PublicKey(mint) : mint;
    if (mintKey.equals(NATIVE_MINT)) return raydiumWsolTokenInfo();
    if (originalGetTokenInfo) return originalGetTokenInfo(mint);
    throw new Error(`Raydium token info unavailable for ${mintKey.toBase58()}`);
  };
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

async function pumpFunLiveInstructions(
  draft: LaunchDraft,
  wallet: PublicKey,
  deps: ProtocolAdapterDependencies
): Promise<TransactionInstruction[]> {
  const sdkModule = deps.loadPumpSdk();
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

  const connection = deps.createConnection(resolveSolanaRpcUrl(), "confirmed");
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

async function raydiumLiveInstructions(
  draft: LaunchDraft,
  wallet: PublicKey,
  deps: ProtocolAdapterDependencies
): Promise<TransactionInstruction[]> {
  const sdk = await deps.loadRaydiumSdk();
  const { Raydium, TxVersion } = sdk;
  const connection = deps.createConnection(resolveSolanaRpcUrl(), "confirmed");
  const raydium = await Raydium.load({
    connection,
    owner: wallet,
    disableFeatureCheck: true,
    disableLoadToken: true
  });
  const buyAmount = solToLamportsBn(draft.firstBuy?.enabled ? draft.firstBuy.amountSol : 0);
  const raydiumExtraConfigs = normalizeRaydiumExtraConfigs(draft.platformSpecificParams.extraConfigs);
  const configId = resolveRaydiumConfigId(sdk);
  const platformId = resolveRaydiumPlatformId(sdk);
  installRaydiumLaunchConfigFallback(raydium, configId);
  installRaydiumTokenInfoFallback(raydium);

  const result = await raydium.launchpad.createLaunchpad({
    configId,
    ...(platformId ? { platformId } : {}),
    mintA: new PublicKey(draft.mintPublicKey),
    name: draft.tokenName,
    symbol: draft.tokenSymbol,
    uri: metadataUri(draft),
    migrateType: (draft.platformSpecificParams.migrateType as "amm" | "cpmm" | undefined) ?? "cpmm",
    buyAmount,
    slippage: integerBn(draft.firstBuy?.slippageBps ?? 0),
    txVersion: TxVersion.LEGACY,
    feePayer: wallet,
    createOnly: !draft.firstBuy?.enabled,
    ...raydiumExtraConfigs
  });

  return collectSdkInstructions(result);
}

async function meteoraLiveInstructions(
  draft: LaunchDraft,
  wallet: PublicKey,
  deps: ProtocolAdapterDependencies
): Promise<TransactionInstruction[]> {
  const { METEORA_DBC_CONFIG_ID } = requireEnv(["METEORA_DBC_CONFIG_ID"]);
  const { DynamicBondingCurveClient } = await deps.loadMeteoraSdk();
  const connection = deps.createConnection(resolveSolanaRpcUrl(), "confirmed");
  const client = DynamicBondingCurveClient.create
    ? DynamicBondingCurveClient.create(connection, "confirmed")
    : new DynamicBondingCurveClient(connection, "confirmed");
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

  const minimumAmountOut = bnFromValue(draft.platformSpecificParams.minimumAmountOut);
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

async function liveInstructions(
  platform: LaunchPlatform,
  draft: LaunchDraft,
  wallet: PublicKey,
  deps: ProtocolAdapterDependencies
): Promise<TransactionInstruction[]> {
  if (platform === "pumpfun") return pumpFunLiveInstructions(draft, wallet, deps);
  if (platform === "raydium_launchlab") return raydiumLiveInstructions(draft, wallet, deps);
  return meteoraLiveInstructions(draft, wallet, deps);
}

function adapter(platform: LaunchPlatform, label: string, deps: ProtocolAdapterDependencies): ProtocolAdapter {
  return {
    platform,
    async buildInstructions(draft, wallet) {
      const mode = getProtocolSdkMode();
      if (mode === "dry-run") return dryRunInstructions(platform, label, draft, wallet);

      const descriptor = getProtocolSdkDescriptor(platform);
      const sdkMethod = getProtocolSdkMethod(platform, !!draft.firstBuy?.enabled);
      const instructions = await liveInstructions(platform, draft, wallet, deps);
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

export function createProtocolAdapters(
  overrides: Partial<ProtocolAdapterDependencies> = {}
): Record<LaunchPlatform, ProtocolAdapter> {
  const deps: ProtocolAdapterDependencies = { ...defaultDependencies, ...overrides };
  return {
    pumpfun: adapter("pumpfun", "pump.fun", deps),
    raydium_launchlab: adapter("raydium_launchlab", "Raydium LaunchLab", deps),
    meteora_dbc: adapter("meteora_dbc", "Meteora DBC", deps)
  };
}

export const protocolAdapters: Record<LaunchPlatform, ProtocolAdapter> = createProtocolAdapters();
