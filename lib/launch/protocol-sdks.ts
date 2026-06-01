import type { LaunchPlatform } from "./types";

export type ProtocolSdkDescriptor = {
  platform: LaunchPlatform;
  packageName: string;
  createOnlyMethod: string;
  createWithFirstBuyMethod: string;
  requiresMintSigner: boolean;
  firstBuyAmountSource: "user_input_sol";
  notes: string[];
};

const descriptors: Record<LaunchPlatform, ProtocolSdkDescriptor> = {
  pumpfun: {
    platform: "pumpfun",
    packageName: "@pump-fun/pump-sdk",
    createOnlyMethod: "PumpSdk.createV2Instruction",
    createWithFirstBuyMethod: "PumpSdk.createV2AndBuyInstructions",
    requiresMintSigner: true,
    firstBuyAmountSource: "user_input_sol",
    notes: [
      "create_v2 requires mint as signer.",
      "First buy uses solAmount and SDK curve helper output for token amount."
    ]
  },
  raydium_launchlab: {
    platform: "raydium_launchlab",
    packageName: "@raydium-io/raydium-sdk-v2",
    createOnlyMethod: "raydium.launchpad.createLaunchpad(createOnly=true)",
    createWithFirstBuyMethod: "raydium.launchpad.createLaunchpad(createOnly=false)",
    requiresMintSigner: true,
    firstBuyAmountSource: "user_input_sol",
    notes: [
      "createLaunchpad uses extraSigners for the new mint keypair.",
      "buyAmount is a top-level parameter; curve extras live in extraConfigs."
    ]
  },
  meteora_dbc: {
    platform: "meteora_dbc",
    packageName: "@meteora-ag/dynamic-bonding-curve-sdk",
    createOnlyMethod: "DynamicBondingCurveClient.pool.createConfigAndPool",
    createWithFirstBuyMethod: "DynamicBondingCurveClient.pool.createConfigAndPoolWithFirstBuy",
    requiresMintSigner: true,
    firstBuyAmountSource: "user_input_sol",
    notes: [
      "initializeVirtualPoolWithSplToken and Token2022 require baseMint as signer.",
      "minimumAmountOut should be calculated from config and slippage, not user-entered."
    ]
  }
};

export function getProtocolSdkDescriptor(platform: LaunchPlatform): ProtocolSdkDescriptor {
  return descriptors[platform];
}

export function getProtocolSdkMethod(platform: LaunchPlatform, firstBuyEnabled: boolean): string {
  const descriptor = getProtocolSdkDescriptor(platform);
  return firstBuyEnabled ? descriptor.createWithFirstBuyMethod : descriptor.createOnlyMethod;
}
