import type { AiProviderConfig, DraftRecommendation, LaunchDraft, LaunchPlatform } from "@/lib/launch/types";

type DraftInput = {
  walletAddress: string;
  goal: string;
  budgetSol: number;
  token: {
    name: string;
    symbol: string;
    description: string;
    imageUri: string;
    metadataUri?: string;
  };
  mintPublicKey?: string;
  firstBuy?: {
    enabled: boolean;
    amountSol: number;
    slippageBps: number;
  };
  preferredPlatform?: LaunchPlatform;
  aiProvider?: AiProviderConfig;
};

function choosePlatform(input: DraftInput): LaunchPlatform {
  if (input.preferredPlatform) return input.preferredPlatform;
  const goal = input.goal.toLowerCase();
  if (goal.includes("fee") || goal.includes("dbc") || input.budgetSol >= 3) return "meteora_dbc";
  if (goal.includes("amm") || goal.includes("raydium") || input.budgetSol >= 1.5) return "raydium_launchlab";
  return "pumpfun";
}

function fallbackRecommendation(input: DraftInput): DraftRecommendation {
  const platform = choosePlatform(input);
  const draft: LaunchDraft = {
    platform,
    walletAddress: input.walletAddress,
    mintPublicKey: input.mintPublicKey ?? input.walletAddress,
    tokenName: input.token.name,
    tokenSymbol: input.token.symbol,
    tokenMetadata: {
      description: input.token.description,
      imageUri: input.token.imageUri,
      metadataUri: input.token.metadataUri
    },
    initialBudgetSol: input.budgetSol,
    firstBuy: input.firstBuy,
    templateVersion: "v1",
    platformSpecificParams: {}
  };

  return {
    platform,
    confidence: input.preferredPlatform ? 0.92 : 0.72,
    reasons: [
      input.preferredPlatform ? "User preferred this platform." : "Selected by built-in MVP launch rules.",
      "The draft uses the v1 safe default template."
    ],
    risks: [
      "AI output is advisory. Final fees, balances, and transaction structure are determined by deterministic validation.",
      "Mainnet launch should be rehearsed on devnet or a dry-run environment first."
    ],
    draft
  };
}

export async function generateLaunchDraft(input: DraftInput): Promise<DraftRecommendation> {
  // MVP keeps a deterministic fallback so the product works even when the user
  // has not configured a model. Provider calls can be enabled without changing
  // the downstream schema.
  if (!input.aiProvider?.apiKey) {
    return fallbackRecommendation(input);
  }

  return fallbackRecommendation(input);
}
