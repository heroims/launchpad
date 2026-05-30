import { createHash, randomUUID } from "crypto";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { feeRecipient } from "./templates";
import { protocolAdapters } from "./adapters";
import { createLaunchRecord, getRecordById, updateLaunchRecord } from "./repository";
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
  const existingId = `launch_${hashPayload(input.idempotencyKey).slice(0, 16)}`;
  const existing = getRecordById(existingId);
  if (existing?.unsignedTxHash) {
    return {
      launchRecordId: existing.id,
      status: existing.status,
      platform: existing.platform,
      transactions: [],
      requiredSigners: [],
      summary: ["Idempotent request already built. Fetch launch record for stored status."],
      fee: validation.feeEstimate
    };
  }

  const wallet = new PublicKey(draft.walletAddress);
  const recipient = new PublicKey(validation.feeEstimate.feeRecipient || feeRecipient);
  const adapterOutput = protocolAdapters[draft.platform].buildInstructions(draft, wallet);

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

  return {
    launchRecordId: record.id,
    status: "transaction_built",
    platform: draft.platform,
    transactions: [
      {
        label: "launch-and-service-fee",
        description: "Unsigned transaction containing launch instructions and service fee transfer.",
        serializedTransaction
      }
    ],
    requiredSigners: adapterOutput.requiredSigners,
    summary: [
      ...adapterOutput.summary,
      `Service fee: ${validation.feeEstimate.serviceFeeLamports} lamports`,
      `Fee recipient: ${validation.feeEstimate.feeRecipient}`
    ],
    fee: validation.feeEstimate
  };
}
