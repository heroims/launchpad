import { createHash, randomUUID } from "crypto";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { feeRecipient } from "./templates";
import { getProtocolSdkMode, protocolAdapters, type ProtocolAdapterOutput, type ProtocolTransactionGroup } from "./adapters";
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function scopedIdempotencyKey(rawKey: string, draft: LaunchDraft): string {
  return `${rawKey}:${hashPayload(stableStringify(draft))}`;
}

function makeProtocolTransactionGroups(adapterOutput: ProtocolAdapterOutput): ProtocolTransactionGroup[] {
  if (adapterOutput.transactionGroups?.length) return adapterOutput.transactionGroups;
  return [
    {
      label: "launch-and-service-fee",
      description: "Unsigned transaction containing launch instructions and service fee transfer.",
      instructions: adapterOutput.instructions,
      partialSigners: adapterOutput.partialSigners
    }
  ];
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

  const scopedKey = scopedIdempotencyKey(input.idempotencyKey, draft);
  const existingId = `launch_${hashPayload(scopedKey).slice(0, 16)}`;
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
  const protocolGroups = makeProtocolTransactionGroups(adapterOutput);
  const lastGroupIndex = protocolGroups.length - 1;

  const transactions = protocolGroups.map((group, index) => {
    const tx = new Transaction({
      feePayer: wallet,
      recentBlockhash: input.recentBlockhash ?? "11111111111111111111111111111111"
    });

    tx.add(...group.instructions);
    if (index === lastGroupIndex) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: wallet,
          toPubkey: recipient,
          lamports: validation.feeEstimate.serviceFeeLamports
        })
      );
    }
    if (group.partialSigners?.length) {
      tx.partialSign(...group.partialSigners);
    }

    return {
      label: index === lastGroupIndex && protocolGroups.length === 1 ? "launch-and-service-fee" : group.label,
      description:
        index === lastGroupIndex
          ? `${group.description} Includes the service fee transfer.`
          : group.description,
      serializedTransaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64")
    };
  });
  const unsignedTxHash = hashPayload(transactions.map((transaction) => transaction.serializedTransaction).join(":"));
  const summary = [
    ...adapterOutput.summary,
    `Transaction count: ${transactions.length}`,
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
    idempotencyKey: scopedKey
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
