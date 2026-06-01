import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { feeRecipient, getLaunchTemplate } from "./templates";
import type { FeeEstimate, LaunchDraft, LaunchIssue, ValidationResult } from "./types";

const launchDraftSchema = z.object({
  platform: z.enum(["pumpfun", "raydium_launchlab", "meteora_dbc"]),
  walletAddress: z.string(),
  mintPublicKey: z.string(),
  tokenName: z.string(),
  tokenSymbol: z.string(),
  tokenMetadata: z.object({
    description: z.string(),
    imageUri: z.string(),
    metadataUri: z.string().optional()
  }),
  initialBudgetSol: z.number(),
  firstBuy: z
    .object({
      enabled: z.boolean(),
      amountSol: z.number(),
      slippageBps: z.number().int()
    })
    .optional(),
  templateVersion: z.string().default("v1"),
  platformSpecificParams: z.record(z.unknown()).default({})
});

function isPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function isHttpUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function makeFeeEstimate(draft?: Pick<LaunchDraft, "platform" | "initialBudgetSol" | "templateVersion">): FeeEstimate {
  if (!draft) {
    return {
      serviceFeeLamports: 0,
      estimatedPriorityFeeLamports: 0,
      estimatedRentLamports: 0,
      estimatedPlatformFeeLamports: 0,
      totalEstimatedLamports: 0,
      feeRecipient
    };
  }

  const template = getLaunchTemplate(draft.platform, draft.templateVersion);
  const budgetLamports = Math.ceil(draft.initialBudgetSol * LAMPORTS_PER_SOL);
  const totalEstimatedLamports =
    budgetLamports +
    template.serviceFeeLamports +
    template.estimatedPriorityFeeLamports +
    template.estimatedRentLamports +
    template.estimatedPlatformFeeLamports;

  return {
    serviceFeeLamports: template.serviceFeeLamports,
    estimatedPriorityFeeLamports: template.estimatedPriorityFeeLamports,
    estimatedRentLamports: template.estimatedRentLamports,
    estimatedPlatformFeeLamports: template.estimatedPlatformFeeLamports,
    totalEstimatedLamports,
    feeRecipient
  };
}

export async function validateLaunchDraft(input: unknown): Promise<ValidationResult> {
  const parsed = launchDraftSchema.safeParse(input);
  const errors: LaunchIssue[] = [];
  const warnings: LaunchIssue[] = [];

  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        code: "schema_invalid",
        message: issue.message,
        field: issue.path.join(".")
      })),
      warnings,
      feeEstimate: makeFeeEstimate()
    };
  }

  const draft = parsed.data;
  const template = getLaunchTemplate(draft.platform, draft.templateVersion);

  if (!isPublicKey(draft.walletAddress)) {
    errors.push({ code: "wallet_invalid", message: "Wallet address is not a valid Solana public key.", field: "walletAddress" });
  }
  if (!isPublicKey(draft.mintPublicKey)) {
    errors.push({ code: "mint_invalid", message: "Mint public key is not a valid Solana public key.", field: "mintPublicKey" });
  }

  const tokenName = draft.tokenName.trim();
  const tokenSymbol = draft.tokenSymbol.trim().toUpperCase();
  const description = draft.tokenMetadata.description.trim();

  if (tokenName.length < 1) {
    errors.push({ code: "token_name_required", message: "Token name is required.", field: "tokenName" });
  }
  if (tokenName.length > 32) {
    errors.push({ code: "token_name_too_long", message: "Token name must be 32 characters or fewer.", field: "tokenName" });
  }
  if (!/^[A-Z0-9]{2,10}$/.test(tokenSymbol)) {
    errors.push({
      code: "token_symbol_invalid",
      message: "Token symbol must be 2-10 uppercase letters or numbers.",
      field: "tokenSymbol"
    });
  }
  if (!isHttpUrl(draft.tokenMetadata.imageUri)) {
    errors.push({ code: "image_uri_invalid", message: "Image URI must be an http(s) URL.", field: "tokenMetadata.imageUri" });
  }
  if (draft.tokenMetadata.metadataUri && !isHttpUrl(draft.tokenMetadata.metadataUri)) {
    errors.push({
      code: "metadata_uri_invalid",
      message: "Metadata URI must be an http(s) URL when provided.",
      field: "tokenMetadata.metadataUri"
    });
  }
  if (draft.initialBudgetSol < template.minBudgetSol) {
    errors.push({
      code: "budget_too_low",
      message: `Initial budget must be at least ${template.minBudgetSol} SOL for this template.`,
      field: "initialBudgetSol"
    });
  }
  if (draft.initialBudgetSol > template.maxBudgetSol) {
    errors.push({
      code: "budget_too_high",
      message: `Initial budget must be ${template.maxBudgetSol} SOL or less for this template.`,
      field: "initialBudgetSol"
    });
  }
  if (draft.firstBuy?.enabled && draft.firstBuy.amountSol <= 0) {
    errors.push({
      code: "first_buy_amount_invalid",
      message: "First buy amount must be greater than 0 SOL when first buy is enabled.",
      field: "firstBuy.amountSol"
    });
  }
  if (draft.firstBuy && (draft.firstBuy.slippageBps < 0 || draft.firstBuy.slippageBps > 5000)) {
    errors.push({
      code: "first_buy_slippage_invalid",
      message: "First buy slippage must be between 0 and 5000 bps.",
      field: "firstBuy.slippageBps"
    });
  }
  if (
    draft.platform === "meteora_dbc" &&
    draft.firstBuy?.enabled &&
    draft.platformSpecificParams.minimumAmountOut === undefined
  ) {
    warnings.push({
      code: "meteora_minimum_out_default_zero",
      message: "Meteora DBC first buy will use minimumAmountOut=0 until quote-based slippage calculation is wired.",
      field: "platformSpecificParams.minimumAmountOut"
    });
  }
  if (!description) {
    warnings.push({
      code: "description_empty",
      message: "A description improves launch metadata and downstream previews.",
      field: "tokenMetadata.description"
    });
  }

  const normalizedDraft: LaunchDraft = {
    ...draft,
    tokenName,
    tokenSymbol,
    tokenMetadata: {
      ...draft.tokenMetadata,
      description
    },
    firstBuy: draft.firstBuy
      ? {
          enabled: draft.firstBuy.enabled,
          amountSol: draft.firstBuy.enabled ? draft.firstBuy.amountSol : 0,
          slippageBps: draft.firstBuy.slippageBps
        }
      : undefined,
    templateVersion: template.version
  };

  return {
    ok: errors.length === 0,
    normalizedDraft: errors.length === 0 ? normalizedDraft : undefined,
    errors,
    warnings,
    feeEstimate: makeFeeEstimate(normalizedDraft)
  };
}
