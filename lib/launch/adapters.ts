import { createRequire } from "module";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getProtocolSdkDescriptor, getProtocolSdkMethod } from "./protocol-sdks";
import { resolveSolanaRpcUrl } from "./rpc";
import type { LaunchDraft, LaunchPlatform } from "./types";

const nodeRequire = createRequire(import.meta.url);

type ProtocolSdkMode = "dry-run" | "live";

export type ProtocolAdapterOutput = {
  instructions: TransactionInstruction[];
  requiredSigners: string[];
  partialSigners?: Keypair[];
  transactionGroups?: ProtocolTransactionGroup[];
  summary: string[];
};

export type ProtocolTransactionGroup = {
  label: string;
  description: string;
  instructions: TransactionInstruction[];
  partialSigners?: Keypair[];
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
  ActivationType?: Record<string, number>;
  BaseFeeMode?: Record<string, number>;
  CollectFeeMode?: Record<string, number>;
  DynamicBondingCurveClient: {
    new (connection: Connection, commitment: "confirmed"): {
      pool: {
        createConfigAndPool?(params: Record<string, unknown>): Promise<unknown>;
        createConfigAndPoolWithFirstBuy?(params: Record<string, unknown>): Promise<unknown>;
        createPool(params: Record<string, unknown>): Promise<unknown>;
        createPoolWithFirstBuy(params: Record<string, unknown>): Promise<unknown>;
      };
    };
    create?: (connection: Connection, commitment?: "confirmed") => {
      pool: {
        createConfigAndPool?(params: Record<string, unknown>): Promise<unknown>;
        createConfigAndPoolWithFirstBuy?(params: Record<string, unknown>): Promise<unknown>;
        createPool(params: Record<string, unknown>): Promise<unknown>;
        createPoolWithFirstBuy(params: Record<string, unknown>): Promise<unknown>;
      };
    };
  };
  MigrationFeeOption?: Record<string, number>;
  MigrationOption?: Record<string, number>;
  TokenDecimal?: Record<string, number>;
  TokenType?: Record<string, number>;
  TokenUpdateAuthorityOption?: Record<string, number>;
  buildCurveWithMarketCap?(params: Record<string, unknown>): Record<string, unknown>;
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

function optionalPublicKeyParam(value: unknown): PublicKey | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return new PublicKey(value.trim());
}

function numberParam(value: unknown, defaultValue: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return defaultValue;
}

function sdkEnumValue(
  sdk: MeteoraSdkModule,
  enumName: keyof Pick<
    MeteoraSdkModule,
    | "ActivationType"
    | "BaseFeeMode"
    | "CollectFeeMode"
    | "MigrationFeeOption"
    | "MigrationOption"
    | "TokenDecimal"
    | "TokenType"
    | "TokenUpdateAuthorityOption"
  >,
  key: string,
  fallback: number
): number {
  const enumValue = sdk[enumName]?.[key];
  return typeof enumValue === "number" ? enumValue : fallback;
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
      ...collectSdkInstructions(candidate.createConfigTx),
      ...collectSdkInstructions(candidate.createPoolWithFirstBuyTx)
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
    partialSigners: [],
    transactionGroups: [],
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

function buildMeteoraDefaultConfigParams(sdk: MeteoraSdkModule, draft: LaunchDraft): Record<string, unknown> {
  if (!sdk.buildCurveWithMarketCap) {
    throw new Error("Meteora DBC SDK does not expose buildCurveWithMarketCap; set METEORA_DBC_CONFIG_ID to use an existing config.");
  }

  return sdk.buildCurveWithMarketCap({
    token: {
      tokenType: sdkEnumValue(sdk, "TokenType", "SPL", 0),
      tokenBaseDecimal: sdkEnumValue(sdk, "TokenDecimal", "SIX", 6),
      tokenQuoteDecimal: sdkEnumValue(sdk, "TokenDecimal", "NINE", 9),
      tokenUpdateAuthority: sdkEnumValue(sdk, "TokenUpdateAuthorityOption", "CreatorUpdateAuthority", 0),
      totalTokenSupply: numberParam(draft.platformSpecificParams.totalTokenSupply, 1_000_000_000),
      leftover: numberParam(draft.platformSpecificParams.leftoverTokenAmount, 0)
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: sdkEnumValue(sdk, "BaseFeeMode", "FeeSchedulerLinear", 0),
        feeSchedulerParam: {
          startingFeeBps: numberParam(draft.platformSpecificParams.startingFeeBps, 100),
          endingFeeBps: numberParam(draft.platformSpecificParams.endingFeeBps, 25),
          numberOfPeriod: numberParam(draft.platformSpecificParams.feeSchedulerPeriods, 10),
          totalDuration: numberParam(draft.platformSpecificParams.feeSchedulerDurationSeconds, 3600)
        }
      },
      dynamicFeeEnabled: boolParam(draft.platformSpecificParams.dynamicFeeEnabled, false),
      collectFeeMode: sdkEnumValue(sdk, "CollectFeeMode", "QuoteToken", 0),
      creatorTradingFeePercentage: numberParam(draft.platformSpecificParams.creatorTradingFeePercentage, 0),
      poolCreationFee: numberParam(draft.platformSpecificParams.poolCreationFeeLamports, 0),
      enableFirstSwapWithMinFee: true
    },
    migration: {
      migrationOption: sdkEnumValue(sdk, "MigrationOption", "MET_DAMM_V2", 1),
      migrationFeeOption: sdkEnumValue(sdk, "MigrationFeeOption", "FixedBps25", 0),
      migrationFee: {
        feePercentage: numberParam(draft.platformSpecificParams.migrationFeePercentage, 0),
        creatorFeePercentage: numberParam(draft.platformSpecificParams.creatorMigrationFeePercentage, 0)
      }
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: numberParam(
        draft.platformSpecificParams.partnerPermanentLockedLiquidityPercentage,
        0
      ),
      partnerLiquidityPercentage: numberParam(draft.platformSpecificParams.partnerLiquidityPercentage, 0),
      creatorPermanentLockedLiquidityPercentage: numberParam(
        draft.platformSpecificParams.creatorPermanentLockedLiquidityPercentage,
        100
      ),
      creatorLiquidityPercentage: numberParam(draft.platformSpecificParams.creatorLiquidityPercentage, 0)
    },
    lockedVesting: {
      totalLockedVestingAmount: numberParam(draft.platformSpecificParams.totalLockedVestingAmount, 0),
      numberOfVestingPeriod: numberParam(draft.platformSpecificParams.numberOfVestingPeriod, 0),
      cliffUnlockAmount: numberParam(draft.platformSpecificParams.cliffUnlockAmount, 0),
      totalVestingDuration: numberParam(draft.platformSpecificParams.totalVestingDuration, 0),
      cliffDurationFromMigrationTime: numberParam(draft.platformSpecificParams.cliffDurationFromMigrationTime, 0)
    },
    activationType: sdkEnumValue(sdk, "ActivationType", "Timestamp", 1),
    initialMarketCap: numberParam(draft.platformSpecificParams.initialMarketCap, 30),
    migrationMarketCap: numberParam(draft.platformSpecificParams.migrationMarketCap, 1000)
  });
}

function buildMeteoraPreCreatePoolParam(draft: LaunchDraft, wallet: PublicKey): Record<string, unknown> {
  return {
    name: draft.tokenName,
    symbol: draft.tokenSymbol,
    uri: metadataUri(draft),
    poolCreator: wallet,
    baseMint: new PublicKey(draft.mintPublicKey)
  };
}

function buildMeteoraFirstBuyParam(draft: LaunchDraft, wallet: PublicKey): Record<string, unknown> {
  return {
    buyer: wallet,
    receiver: wallet,
    buyAmount: solToLamportsBn(draft.firstBuy?.amountSol ?? 0),
    minimumAmountOut: bnFromValue(draft.platformSpecificParams.minimumAmountOut ?? 0),
    referralTokenAccount: optionalPublicKeyParam(draft.platformSpecificParams.referralTokenAccount) ?? null
  };
}

async function meteoraLiveInstructions(
  draft: LaunchDraft,
  wallet: PublicKey,
  deps: ProtocolAdapterDependencies
): Promise<ProtocolAdapterOutput> {
  const sdk = await deps.loadMeteoraSdk();
  const { DynamicBondingCurveClient } = sdk;
  const connection = deps.createConnection(resolveSolanaRpcUrl(), "confirmed");
  const client = DynamicBondingCurveClient.create
    ? DynamicBondingCurveClient.create(connection, "confirmed")
    : new DynamicBondingCurveClient(connection, "confirmed");
  const configuredConfigId =
    optionalPublicKeyParam(draft.platformSpecificParams.meteoraConfigId) ?? optionalPublicKeyEnv("METEORA_DBC_CONFIG_ID");
  const createPoolParam = {
    baseMint: new PublicKey(draft.mintPublicKey),
    config: configuredConfigId,
    name: draft.tokenName,
    symbol: draft.tokenSymbol,
    uri: metadataUri(draft),
    payer: wallet,
    poolCreator: wallet
  };

  if (configuredConfigId) {
    if (!draft.firstBuy?.enabled) {
      return {
        instructions: collectSdkInstructions(await client.pool.createPool(createPoolParam)),
        requiredSigners: [],
        partialSigners: [],
        summary: []
      };
    }

    return {
      instructions: collectSdkInstructions(
        await client.pool.createPoolWithFirstBuy({
          createPoolParam,
          firstBuyParam: buildMeteoraFirstBuyParam(draft, wallet)
        })
      ),
      requiredSigners: [],
      partialSigners: [],
      summary: []
    };
  }

  const configKeypair = Keypair.generate();
  const configAndPoolParams = {
    ...buildMeteoraDefaultConfigParams(sdk, draft),
    config: configKeypair.publicKey,
    feeClaimer: wallet,
    leftoverReceiver: wallet,
    quoteMint: NATIVE_MINT,
    payer: wallet,
    preCreatePoolParam: buildMeteoraPreCreatePoolParam(draft, wallet)
  };

  if (!draft.firstBuy?.enabled) {
    if (!client.pool.createConfigAndPool) {
      throw new Error("Meteora DBC SDK does not expose createConfigAndPool; set METEORA_DBC_CONFIG_ID to use an existing config.");
    }
    return {
      instructions: collectSdkInstructions(await client.pool.createConfigAndPool(configAndPoolParams)),
      requiredSigners: [],
      partialSigners: [configKeypair],
      transactionGroups: [],
      summary: [`Meteora config: generated ${configKeypair.publicKey.toBase58()}`]
    };
  }

  if (!client.pool.createConfigAndPoolWithFirstBuy) {
    throw new Error(
      "Meteora DBC SDK does not expose createConfigAndPoolWithFirstBuy; set METEORA_DBC_CONFIG_ID to use an existing config."
    );
  }

  const result = await client.pool.createConfigAndPoolWithFirstBuy({
    ...configAndPoolParams,
    firstBuyParam: buildMeteoraFirstBuyParam(draft, wallet)
  });
  const createConfigInstructions = isRecord(result) ? collectSdkInstructions(result.createConfigTx) : [];
  const createPoolWithFirstBuyInstructions = isRecord(result) ? collectSdkInstructions(result.createPoolWithFirstBuyTx) : [];

  return {
    instructions: collectSdkInstructions(result),
    requiredSigners: [],
    partialSigners: [configKeypair],
    transactionGroups:
      createConfigInstructions.length > 0 && createPoolWithFirstBuyInstructions.length > 0
        ? [
            {
              label: "meteora-create-config",
              description: "Create the launch-specific Meteora DBC config.",
              instructions: createConfigInstructions,
              partialSigners: [configKeypair]
            },
            {
              label: "meteora-create-pool-first-buy",
              description: "Create the Meteora DBC pool and execute the optional first buy.",
              instructions: createPoolWithFirstBuyInstructions,
              partialSigners: []
            }
          ]
        : [],
    summary: [`Meteora config: generated ${configKeypair.publicKey.toBase58()}`]
  };
}

async function liveInstructions(
  platform: LaunchPlatform,
  draft: LaunchDraft,
  wallet: PublicKey,
  deps: ProtocolAdapterDependencies
): Promise<Pick<ProtocolAdapterOutput, "instructions" | "partialSigners" | "transactionGroups" | "summary">> {
  if (platform === "pumpfun") {
    return { instructions: await pumpFunLiveInstructions(draft, wallet, deps), partialSigners: [], transactionGroups: [], summary: [] };
  }
  if (platform === "raydium_launchlab") {
    return { instructions: await raydiumLiveInstructions(draft, wallet, deps), partialSigners: [], transactionGroups: [], summary: [] };
  }
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
      const adapterOutput = await liveInstructions(platform, draft, wallet, deps);
      if (adapterOutput.instructions.length === 0) {
        throw new Error(`${label} SDK returned no launch instructions.`);
      }

      return {
        instructions: adapterOutput.instructions,
        requiredSigners: descriptor.requiresMintSigner ? [draft.mintPublicKey] : [],
        partialSigners: adapterOutput.partialSigners ?? [],
        transactionGroups: adapterOutput.transactionGroups ?? [],
        summary: [
          "Adapter mode: live",
          `${label} launch template ${draft.templateVersion}`,
          `SDK package: ${descriptor.packageName}`,
          `SDK method: ${sdkMethod}`,
          `Mint: ${draft.mintPublicKey}`,
          `Prepare token ${draft.tokenSymbol} with ${draft.initialBudgetSol} SOL initial budget`,
          draft.firstBuy?.enabled ? `First buy: ${draft.firstBuy.amountSol} SOL` : "First buy: disabled",
          ...adapterOutput.summary,
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
