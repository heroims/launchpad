import { describe, expect, it } from "vitest";
import { prepareSkillLaunch } from "@/lib/skill/prepare-launch";

describe("prepareSkillLaunch", () => {
  it("builds a draft, validates it, and returns unsigned transaction payloads", async () => {
    const result = await prepareSkillLaunch({
      walletAddress: "11111111111111111111111111111111",
      goal: "Launch a meme token with safer defaults",
      budgetSol: 1,
      token: {
        name: "Skill Token",
        symbol: "SKILL",
        description: "A token launched through the skill API",
        imageUri: "https://example.com/skill.png"
      },
      mintPublicKey: "11111111111111111111111111111111",
      firstBuy: {
        enabled: false,
        amountSol: 0,
        slippageBps: 100
      },
      idempotencyKey: "skill-idem-1"
    });

    expect(result.launchRecordId).toMatch(/^launch_/);
    expect(result.recommendation.platform).toMatch(/pumpfun|raydium_launchlab|meteora_dbc/);
    expect(result.validation.ok).toBe(true);
    expect(result.transactions.length).toBeGreaterThan(0);
    expect(result.signingUrl).toContain(result.launchRecordId);
  });
});
