import { describe, expect, it } from "vitest";
import { validateLaunchDraft } from "@/lib/launch/validator";

describe("validateLaunchDraft", () => {
  it("rejects a draft when required launch fields are missing or invalid", async () => {
    const result = await validateLaunchDraft({
      platform: "pumpfun",
      walletAddress: "not-a-wallet",
      tokenName: "",
      tokenSymbol: "too-long-symbol",
      tokenMetadata: { description: "", imageUri: "bad-uri" },
      initialBudgetSol: 0,
      mintPublicKey: "not-a-mint",
      templateVersion: "v1",
      platformSpecificParams: {}
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "wallet_invalid" }),
        expect.objectContaining({ code: "mint_invalid" }),
        expect.objectContaining({ code: "token_name_required" }),
        expect.objectContaining({ code: "budget_too_low" })
      ])
    );
  });

  it("returns a normalized draft and fee estimate for valid minimum parameters", async () => {
    const result = await validateLaunchDraft({
      platform: "meteora_dbc",
      walletAddress: "11111111111111111111111111111111",
      tokenName: "Launch Token",
      tokenSymbol: "launch",
      tokenMetadata: {
        description: "A test launch",
        imageUri: "https://example.com/token.png",
        metadataUri: "https://example.com/metadata.json"
      },
      initialBudgetSol: 1.5,
      mintPublicKey: "11111111111111111111111111111111",
      firstBuy: {
        enabled: true,
        amountSol: 0.25,
        slippageBps: 100
      },
      templateVersion: "v1",
      platformSpecificParams: {}
    });

    expect(result.ok).toBe(true);
    expect(result.normalizedDraft?.tokenSymbol).toBe("LAUNCH");
    expect(result.normalizedDraft?.firstBuy).toEqual({
      enabled: true,
      amountSol: 0.25,
      slippageBps: 100
    });
    expect(result.feeEstimate.serviceFeeLamports).toBeGreaterThan(0);
    expect(result.feeEstimate.feeRecipient).toBe("HpijwaAmevR4rFCP7kA1iTLB4gUKjhAJE6WkwdorMxzD");
  });

  it("rejects enabled first buy without a positive amount", async () => {
    const result = await validateLaunchDraft({
      platform: "pumpfun",
      walletAddress: "11111111111111111111111111111111",
      tokenName: "Launch Token",
      tokenSymbol: "LAUNCH",
      tokenMetadata: {
        description: "A test launch",
        imageUri: "https://example.com/token.png"
      },
      initialBudgetSol: 1,
      mintPublicKey: "11111111111111111111111111111111",
      firstBuy: {
        enabled: true,
        amountSol: 0,
        slippageBps: 100
      },
      templateVersion: "v1",
      platformSpecificParams: {}
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "first_buy_amount_invalid" })]));
  });
});
