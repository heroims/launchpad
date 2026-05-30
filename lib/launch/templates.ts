import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { LaunchPlatform } from "./types";

export type LaunchTemplate = {
  platform: LaunchPlatform;
  version: string;
  minBudgetSol: number;
  maxBudgetSol: number;
  serviceFeeLamports: number;
  estimatedRentLamports: number;
  estimatedPriorityFeeLamports: number;
  estimatedPlatformFeeLamports: number;
  requiredFields: string[];
};

const defaultServiceFeeLamports = Number(process.env.LAUNCH_FEE_LAMPORTS ?? 0.05 * LAMPORTS_PER_SOL);

export const feeRecipient = process.env.FEE_RECIPIENT_PUBLIC_KEY ?? "11111111111111111111111111111111";

export const launchTemplates: Record<LaunchPlatform, LaunchTemplate> = {
  pumpfun: {
    platform: "pumpfun",
    version: "v1",
    minBudgetSol: 0.05,
    maxBudgetSol: 50,
    serviceFeeLamports: defaultServiceFeeLamports,
    estimatedRentLamports: 0.01 * LAMPORTS_PER_SOL,
    estimatedPriorityFeeLamports: 0.002 * LAMPORTS_PER_SOL,
    estimatedPlatformFeeLamports: 0,
    requiredFields: ["tokenName", "tokenSymbol", "tokenMetadata.imageUri"]
  },
  raydium_launchlab: {
    platform: "raydium_launchlab",
    version: "v1",
    minBudgetSol: 0.5,
    maxBudgetSol: 500,
    serviceFeeLamports: defaultServiceFeeLamports,
    estimatedRentLamports: 0.03 * LAMPORTS_PER_SOL,
    estimatedPriorityFeeLamports: 0.004 * LAMPORTS_PER_SOL,
    estimatedPlatformFeeLamports: 0.01 * LAMPORTS_PER_SOL,
    requiredFields: ["tokenName", "tokenSymbol", "tokenMetadata.imageUri", "tokenMetadata.description"]
  },
  meteora_dbc: {
    platform: "meteora_dbc",
    version: "v1",
    minBudgetSol: 0.3,
    maxBudgetSol: 500,
    serviceFeeLamports: defaultServiceFeeLamports,
    estimatedRentLamports: 0.03 * LAMPORTS_PER_SOL,
    estimatedPriorityFeeLamports: 0.004 * LAMPORTS_PER_SOL,
    estimatedPlatformFeeLamports: 0.01 * LAMPORTS_PER_SOL,
    requiredFields: ["tokenName", "tokenSymbol", "tokenMetadata.imageUri", "tokenMetadata.description"]
  }
};

export function getLaunchTemplate(platform: LaunchPlatform, version = "v1"): LaunchTemplate {
  const template = launchTemplates[platform];
  if (!template || template.version !== version) {
    throw new Error(`Unsupported launch template: ${platform}@${version}`);
  }
  return template;
}
