import { describe, expect, it } from "vitest";
import {
  applyLaunchFormToDraft,
  createLaunchIdempotencyKey,
  formatLamportsAsSol,
  getDraftForBuild,
  getDraftForValidation,
  getLaunchFeeEstimate,
  makeBuildTransactionPayload,
  redactFeeRecipientsForDisplay,
  shouldShowFirstBuyFields
} from "@/lib/launch/workbench-flow";
import type { LaunchDraft } from "@/lib/launch/types";

const draft: LaunchDraft = {
  platform: "pumpfun",
  walletAddress: "11111111111111111111111111111111",
  mintPublicKey: "11111111111111111111111111111111",
  tokenName: "Workbench Token",
  tokenSymbol: "WORK",
  tokenMetadata: {
    description: "A token prepared from the web workbench",
    imageUri: "https://example.com/work.png"
  },
  initialBudgetSol: 1,
  firstBuy: {
    enabled: false,
    amountSol: 0,
    slippageBps: 100
  },
  templateVersion: "v1",
  platformSpecificParams: {}
};

describe("workbench launch flow helpers", () => {
  it("extracts a generated draft for validation", () => {
    expect(getDraftForValidation({ draft })).toEqual(draft);
    expect(getDraftForValidation({ recommendation: { draft } })).toEqual(draft);
  });

  it("only allows validated drafts to be built into transactions", () => {
    expect(getDraftForBuild({ draft })).toBeNull();
    expect(getDraftForBuild({ ok: true, normalizedDraft: draft })).toEqual(draft);
    expect(getDraftForBuild({ validation: { ok: true, normalizedDraft: draft } })).toEqual(draft);
  });

  it("creates the build-transaction API payload from a validation response", () => {
    expect(makeBuildTransactionPayload({ ok: true, normalizedDraft: draft }, "idem-workbench")).toEqual({
      draft,
      idempotencyKey: "idem-workbench"
    });
  });

  it("applies current form platform and first-buy values over a stale generated draft", () => {
    const updated = applyLaunchFormToDraft(draft, {
      walletAddress: draft.walletAddress,
      mintPublicKey: draft.mintPublicKey,
      tokenName: draft.tokenName,
      tokenSymbol: draft.tokenSymbol,
      description: draft.tokenMetadata.description,
      imageUri: draft.tokenMetadata.imageUri,
      budgetSol: "1",
      preferredPlatform: "meteora_dbc",
      firstBuyEnabled: "true",
      firstBuyAmountSol: "0.2",
      firstBuySlippageBps: "150"
    });

    expect(updated.platform).toBe("meteora_dbc");
    expect(updated.firstBuy).toEqual({ enabled: true, amountSol: 0.2, slippageBps: 150 });
  });

  it("creates different idempotency keys when the selected launch platform changes", () => {
    const baseInput = {
      walletAddress: "11111111111111111111111111111111",
      mintPublicKey: "11111111111111111111111111111111",
      tokenSymbol: "WORK",
      budgetSol: "1",
      firstBuyEnabled: "false",
      firstBuyAmountSol: "0"
    };

    expect(createLaunchIdempotencyKey({ ...baseInput, preferredPlatform: "raydium_launchlab" })).not.toBe(
      createLaunchIdempotencyKey({ ...baseInput, preferredPlatform: "meteora_dbc" })
    );
  });

  it("extracts and formats fee estimates for pre-sign confirmation", () => {
    const feeEstimate = {
      serviceFeeLamports: 50_000_000,
      estimatedPriorityFeeLamports: 2_000_000,
      estimatedRentLamports: 10_000_000,
      estimatedPlatformFeeLamports: 0,
      totalEstimatedLamports: 1_062_000_000,
      feeRecipient: "11111111111111111111111111111111"
    };

    expect(getLaunchFeeEstimate({ feeEstimate })).toEqual(feeEstimate);
    expect(getLaunchFeeEstimate({ validation: { feeEstimate } })).toEqual(feeEstimate);
    expect(formatLamportsAsSol(50_000_000)).toBe("0.05 SOL");
    expect(formatLamportsAsSol(1_062_000_000)).toBe("1.062 SOL");
  });

  it("only shows first-buy amount fields when first buy is enabled", () => {
    expect(shouldShowFirstBuyFields("false")).toBe(false);
    expect(shouldShowFirstBuyFields("true")).toBe(true);
  });

  it("redacts fee recipients from display-only API output", () => {
    const hidden = redactFeeRecipientsForDisplay({
      feeEstimate: {
        serviceFeeLamports: 50_000_000,
        estimatedPriorityFeeLamports: 2_000_000,
        estimatedRentLamports: 10_000_000,
        estimatedPlatformFeeLamports: 0,
        totalEstimatedLamports: 1_062_000_000,
        feeRecipient: "HpijwaAmevR4rFCP7kA1iTLB4gUKjhAJE6WkwdorMxzD"
      },
      summary: ["Service fee: 50000000 lamports", "Fee recipient: HpijwaAmevR4rFCP7kA1iTLB4gUKjhAJE6WkwdorMxzD"],
      nested: {
        fee: {
          feeRecipient: "HpijwaAmevR4rFCP7kA1iTLB4gUKjhAJE6WkwdorMxzD"
        }
      }
    });

    const rendered = JSON.stringify(hidden);
    expect(rendered).not.toContain("HpijwaAmevR4rFCP7kA1iTLB4gUKjhAJE6WkwdorMxzD");
    expect(rendered).toContain("已隐藏");
  });
});
