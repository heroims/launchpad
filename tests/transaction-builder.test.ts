import { describe, expect, it } from "vitest";
import { Transaction } from "@solana/web3.js";
import { buildLaunchTransaction } from "@/lib/launch/build-transaction";

describe("buildLaunchTransaction", () => {
  it("adds the configured service fee transfer and returns a signable transaction", async () => {
    const result = await buildLaunchTransaction({
      draft: {
        platform: "raydium_launchlab",
        walletAddress: "11111111111111111111111111111111",
        tokenName: "Launch Token",
        tokenSymbol: "LAUNCH",
        tokenMetadata: {
          description: "A test launch",
          imageUri: "https://example.com/token.png"
        },
        initialBudgetSol: 2,
        mintPublicKey: "11111111111111111111111111111111",
        firstBuy: {
          enabled: true,
          amountSol: 0.2,
          slippageBps: 100
        },
        templateVersion: "v1",
        platformSpecificParams: {}
      },
      idempotencyKey: "idem-1",
      recentBlockhash: "11111111111111111111111111111111"
    });

    expect(result.launchRecordId).toMatch(/^launch_/);
    expect(result.fee.serviceFeeLamports).toBe(50_000_000);
    expect(result.transactions).toHaveLength(1);

    const tx = Transaction.from(Buffer.from(result.transactions[0].serializedTransaction, "base64"));
    expect(tx.instructions.length).toBeGreaterThanOrEqual(2);
    expect(tx.feePayer?.toBase58()).toBe("11111111111111111111111111111111");
    expect(result.summary).toContain("Service fee: 50000000 lamports");
    expect(result.summary).toContain("First buy: 0.2 SOL");
    expect(result.summary).toContain("SDK method: raydium.launchpad.createLaunchpad(createOnly=false)");
    expect(result.requiredSigners).toContain("11111111111111111111111111111111");
  });

  it("returns the same launch record for repeated idempotency keys", async () => {
    const first = await buildLaunchTransaction({
      draft: {
        platform: "pumpfun",
        walletAddress: "11111111111111111111111111111111",
        tokenName: "Same Token",
        tokenSymbol: "SAME",
        tokenMetadata: {
          description: "A test launch",
          imageUri: "https://example.com/token.png"
        },
        initialBudgetSol: 1,
        mintPublicKey: "11111111111111111111111111111111",
        templateVersion: "v1",
        platformSpecificParams: {}
      },
      idempotencyKey: "idem-repeat",
      recentBlockhash: "11111111111111111111111111111111"
    });

    const second = await buildLaunchTransaction({
      draft: {
        platform: "pumpfun",
        walletAddress: "11111111111111111111111111111111",
        tokenName: "Same Token",
        tokenSymbol: "SAME",
        tokenMetadata: {
          description: "A test launch",
          imageUri: "https://example.com/token.png"
        },
        initialBudgetSol: 1,
        mintPublicKey: "11111111111111111111111111111111",
        templateVersion: "v1",
        platformSpecificParams: {}
      },
      idempotencyKey: "idem-repeat",
      recentBlockhash: "11111111111111111111111111111111"
    });

    expect(second.launchRecordId).toBe(first.launchRecordId);
  });
});
