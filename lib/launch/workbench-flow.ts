import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { FeeEstimate, LaunchDraft } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLaunchDraft(value: unknown): value is LaunchDraft {
  if (!isRecord(value)) return false;
  return (
    typeof value.platform === "string" &&
    typeof value.walletAddress === "string" &&
    typeof value.mintPublicKey === "string" &&
    typeof value.tokenName === "string" &&
    typeof value.tokenSymbol === "string" &&
    isRecord(value.tokenMetadata) &&
    typeof value.initialBudgetSol === "number" &&
    typeof value.templateVersion === "string" &&
    isRecord(value.platformSpecificParams)
  );
}

function isFeeEstimate(value: unknown): value is FeeEstimate {
  if (!isRecord(value)) return false;
  return (
    typeof value.serviceFeeLamports === "number" &&
    typeof value.estimatedPriorityFeeLamports === "number" &&
    typeof value.estimatedRentLamports === "number" &&
    typeof value.estimatedPlatformFeeLamports === "number" &&
    typeof value.totalEstimatedLamports === "number" &&
    typeof value.feeRecipient === "string"
  );
}

export function getDraftForValidation(value: unknown): LaunchDraft | null {
  if (!isRecord(value)) return null;
  if (isLaunchDraft(value.draft)) return value.draft;

  const recommendation = value.recommendation;
  if (isRecord(recommendation) && isLaunchDraft(recommendation.draft)) {
    return recommendation.draft;
  }

  return null;
}

export function getDraftForBuild(value: unknown): LaunchDraft | null {
  if (!isRecord(value)) return null;
  if (value.ok === true && isLaunchDraft(value.normalizedDraft)) return value.normalizedDraft;

  const validation = value.validation;
  if (isRecord(validation) && validation.ok === true && isLaunchDraft(validation.normalizedDraft)) {
    return validation.normalizedDraft;
  }

  return null;
}

export function makeBuildTransactionPayload(value: unknown, idempotencyKey: string): { draft: LaunchDraft; idempotencyKey: string } | null {
  const draft = getDraftForBuild(value);
  if (!draft) return null;
  return { draft, idempotencyKey };
}

export function getLaunchFeeEstimate(value: unknown): FeeEstimate | null {
  if (!isRecord(value)) return null;
  if (isFeeEstimate(value.feeEstimate)) return value.feeEstimate;
  if (isFeeEstimate(value.fee)) return value.fee;

  const validation = value.validation;
  if (isRecord(validation) && isFeeEstimate(validation.feeEstimate)) {
    return validation.feeEstimate;
  }

  return null;
}

export function formatLamportsAsSol(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  return `${Number(sol.toFixed(9)).toString()} SOL`;
}

export function shouldShowFirstBuyFields(firstBuyEnabled: string): boolean {
  return firstBuyEnabled === "true";
}

export function redactFeeRecipientsForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactFeeRecipientsForDisplay(item));

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        key === "feeRecipient" ? "已隐藏" : redactFeeRecipientsForDisplay(entry)
      ])
    );
  }

  if (typeof value === "string" && value.toLowerCase().startsWith("fee recipient:")) {
    return "Fee recipient: 已隐藏";
  }

  return value;
}
