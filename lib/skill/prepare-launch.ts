import { buildLaunchTransaction } from "@/lib/launch/build-transaction";
import { validateLaunchDraft } from "@/lib/launch/validator";
import { generateLaunchDraft } from "@/lib/ai/providers";
import type { AiProviderConfig, LaunchPlatform } from "@/lib/launch/types";

type PrepareSkillLaunchInput = {
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
  preferredPlatform?: LaunchPlatform;
  aiProvider?: AiProviderConfig;
  idempotencyKey: string;
};

export async function prepareSkillLaunch(input: PrepareSkillLaunchInput) {
  const recommendation = await generateLaunchDraft(input);
  const validation = await validateLaunchDraft(recommendation.draft);
  if (!validation.ok || !validation.normalizedDraft) {
    return {
      recommendation,
      validation,
      transactions: [],
      launchRecordId: null,
      signingUrl: null
    };
  }

  const built = await buildLaunchTransaction({
    draft: validation.normalizedDraft,
    idempotencyKey: input.idempotencyKey
  });

  return {
    recommendation,
    validation,
    ...built,
    signingUrl: `/sign/${built.launchRecordId}`
  };
}
