import type { LaunchRecord, LaunchStatus, TransactionPayload } from "./types";

const records = new Map<string, LaunchRecord>();
const idempotencyIndex = new Map<string, string>();
const buildPayloads = new Map<
  string,
  {
    transactions: TransactionPayload[];
    requiredSigners: string[];
    summary: string[];
  }
>();

export function createLaunchRecord(record: Omit<LaunchRecord, "createdAt" | "updatedAt">): LaunchRecord {
  if (record.idempotencyKey) {
    const existingId = idempotencyIndex.get(record.idempotencyKey);
    if (existingId) {
      const existing = records.get(existingId);
      if (existing) return existing;
    }
  }

  const now = new Date().toISOString();
  const stored: LaunchRecord = {
    ...record,
    createdAt: now,
    updatedAt: now
  };
  records.set(stored.id, stored);
  if (stored.idempotencyKey) idempotencyIndex.set(stored.idempotencyKey, stored.id);
  return stored;
}

export function getRecordById(id: string): LaunchRecord | undefined {
  return records.get(id);
}

export function storeBuildPayload(
  launchRecordId: string,
  payload: {
    transactions: TransactionPayload[];
    requiredSigners: string[];
    summary: string[];
  }
): void {
  buildPayloads.set(launchRecordId, payload);
}

export function getBuildPayload(launchRecordId: string):
  | {
      transactions: TransactionPayload[];
      requiredSigners: string[];
      summary: string[];
    }
  | undefined {
  return buildPayloads.get(launchRecordId);
}

export function updateLaunchRecord(
  id: string,
  update: Partial<Pick<LaunchRecord, "signature" | "errorMessage">> & { status?: LaunchStatus; unsignedTxHash?: string }
): LaunchRecord | undefined {
  const existing = records.get(id);
  if (!existing) return undefined;
  const next: LaunchRecord = {
    ...existing,
    ...update,
    updatedAt: new Date().toISOString()
  };
  records.set(id, next);
  return next;
}
