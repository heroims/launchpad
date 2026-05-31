import { afterEach, describe, expect, it, vi } from "vitest";
import { Keypair, SystemInstruction, SystemProgram, Transaction } from "@solana/web3.js";
import { buildLaunchTransaction } from "@/lib/launch/build-transaction";

describe("buildLaunchTransaction", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("adds one service fee transfer to the configured recipient after SDK launch instructions", async () => {
    const wallet = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;

    const result = await buildLaunchTransaction({
      draft: {
        platform: "pumpfun",
        walletAddress: wallet.toBase58(),
        tokenName: "Launch Token",
        tokenSymbol: "LAUNCH",
        tokenMetadata: {
          description: "A test launch",
          imageUri: "https://example.com/token.png"
        },
        initialBudgetSol: 1,
        mintPublicKey: mint.toBase58(),
        firstBuy: {
          enabled: false,
          amountSol: 0,
          slippageBps: 100
        },
        templateVersion: "v1",
        platformSpecificParams: {}
      },
      idempotencyKey: "idem-fee-recipient",
      recentBlockhash: "11111111111111111111111111111111"
    });

    expect(result.launchRecordId).toMatch(/^launch_/);
    expect(result.fee.serviceFeeLamports).toBe(50_000_000);
    expect(result.transactions).toHaveLength(1);

    const tx = Transaction.from(Buffer.from(result.transactions[0].serializedTransaction, "base64"));
    const serviceFeeInstructions = tx.instructions.filter((instruction) => instruction.programId.equals(SystemProgram.programId));
    expect(serviceFeeInstructions).toHaveLength(1);
    const serviceFeeTransfer = SystemInstruction.decodeTransfer(serviceFeeInstructions[0]);
    expect(serviceFeeTransfer.fromPubkey.toBase58()).toBe(wallet.toBase58());
    expect(serviceFeeTransfer.toPubkey.toBase58()).toBe("HpijwaAmevR4rFCP7kA1iTLB4gUKjhAJE6WkwdorMxzD");
    expect(Number(serviceFeeTransfer.lamports)).toBe(50_000_000);
    expect(tx.feePayer?.toBase58()).toBe(wallet.toBase58());
    expect(result.summary).toContain("Service fee: 50000000 lamports");
    expect(result.summary).toContain("First buy: disabled");
    expect(result.summary).toContain("SDK method: PumpSdk.createV2Instruction");
    expect(result.requiredSigners).toContain(mint.toBase58());
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
    expect(second.transactions).toHaveLength(1);
    expect(second.transactions[0].serializedTransaction).toBe(first.transactions[0].serializedTransaction);
    expect(second.requiredSigners).toEqual(first.requiredSigners);
  });

  it("rejects dry-run adapters for user-signable transaction builds", async () => {
    vi.stubEnv("PROTOCOL_SDK_MODE", "dry-run");

    await expect(
      buildLaunchTransaction({
        draft: {
          platform: "pumpfun",
          walletAddress: Keypair.generate().publicKey.toBase58(),
          tokenName: "Dry Run Token",
          tokenSymbol: "DRYRUN",
          tokenMetadata: {
            description: "A test launch",
            imageUri: "https://example.com/token.png"
          },
          initialBudgetSol: 1,
          mintPublicKey: Keypair.generate().publicKey.toBase58(),
          templateVersion: "v1",
          platformSpecificParams: {}
        },
        idempotencyKey: "idem-dry-run-rejected",
        recentBlockhash: "11111111111111111111111111111111"
      })
    ).rejects.toThrow(/Dry-run protocol SDK mode cannot build user-signable launch transactions/);
  });
});
