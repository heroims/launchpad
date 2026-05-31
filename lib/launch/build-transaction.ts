import { createHash, randomUUID } from "crypto";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { feeRecipient } from "./templates";
import { getProtocolSdkMode, protocolAdapters } from "./adapters";
import { createLaunchRecord, getBuildPayload, getRecordById, storeBuildPayload, updateLaunchRecord } from "./repository";
import { validateLaunchDraft } from "./validator";
import type { BuildTransactionResult, LaunchDraft } from "./types";

type BuildInput = {
  draft: LaunchDraft;
  idempotencyKey: string;
  recentBlockhash?: string;
};

function hashPayload(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function buildLaunchTransaction(input: BuildInput): Promise<BuildTransactionResult> {
  const validation = await validateLaunchDraft(input.draft);
  if (!validation.ok || !validation.normalizedDraft) {
    throw new Error(`Launch draft is invalid: ${validation.errors.map((error) => error.code).join(", ")}`);
  }

  const draft = validation.normalizedDraft;
  if (getProtocolSdkMode() === "dry-run") {
    throw new Error("Dry-run protocol SDK mode cannot build user-signable launch transactions. Set PROTOCOL_SDK_MODE=live.");
  }

  const existingId = `launch_${hashPayload(input.idempotencyKey).slice(0, 16)}`;
  const existing = getRecordById(existingId);
  if (existing?.unsignedTxHash) {
    const cachedPayload = getBuildPayload(existing.id);
    return {
      launchRecordId: existing.id,
      status: existing.status,
      platform: existing.platform,
      transactions: cachedPayload?.transactions ?? [],
      requiredSigners: cachedPayload?.requiredSigners ?? [],
      summary: cachedPayload?.summary ?? ["Idempotent request already built, but unsigned transaction payload is no longer cached."],
      fee: validation.feeEstimate
    };
  }

  const wallet = new PublicKey(draft.walletAddress);
  const recipient = new PublicKey(validation.feeEstimate.feeRecipient || feeRecipient);
  const adapterOutput = await protocolAdapters[draft.platform].buildInstructions(draft, wallet);

  const tx = new Transaction({
    feePayer: wallet,
    recentBlockhash: input.recentBlockhash ?? "11111111111111111111111111111111"
  });

  tx.add(...adapterOutput.instructions);
  tx.add(
    SystemProgram.transfer({
      fromPubkey: wallet,
      toPubkey: recipient,
      lamports: validation.feeEstimate.serviceFeeLamports
    })
  );

  const serializedTransaction = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
  const unsignedTxHash = hashPayload(serializedTransaction);

  const transactions = [
    {
      label: "launch-and-service-fee",
      description: "Unsigned transaction containing launch instructions and service fee transfer.",
      serializedTransaction
    }
  ];
  const summary = [
    ...adapterOutput.summary,
    `Service fee: ${validation.feeEstimate.serviceFeeLamports} lamports`,
    "Fee recipient: configured"
  ];

  const record = createLaunchRecord({
    id: existingId || `launch_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
    walletAddress: draft.walletAddress,
    platform: draft.platform,
    status: "transaction_built",
    draftSummary: {
      platform: draft.platform,
      tokenName: draft.tokenName,
      tokenSymbol: draft.tokenSymbol,
      initialBudgetSol: draft.initialBudgetSol
    },
    templateVersion: draft.templateVersion,
    feeAmountLamports: validation.feeEstimate.serviceFeeLamports,
    feeRecipient: validation.feeEstimate.feeRecipient,
    unsignedTxHash,
    idempotencyKey: input.idempotencyKey
  });

  updateLaunchRecord(record.id, { unsignedTxHash, status: "transaction_built" });
  storeBuildPayload(record.id, {
    transactions,
    requiredSigners: adapterOutput.requiredSigners,
    summary
  });

  return {
    launchRecordId: record.id,
    status: "transaction_built",
    platform: draft.platform,
    transactions,
    requiredSigners: adapterOutput.requiredSigners,
    summary,
    fee: validation.feeEstimate
  };
}
