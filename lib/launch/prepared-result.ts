import type { BuildTransactionResult } from "./types";

export type PreparedLaunchResult = Pick<
  BuildTransactionResult,
  "launchRecordId" | "transactions" | "requiredSigners" | "fee" | "summary"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function getPreparedLaunchResult(value: unknown): PreparedLaunchResult | null {
  if (!isRecord(value)) return null;
  if (typeof value.launchRecordId !== "string") return null;
  if (!Array.isArray(value.transactions) || value.transactions.length === 0) return null;
  if (!Array.isArray(value.requiredSigners)) return null;
  if (!Array.isArray(value.summary)) return null;
  if (!isRecord(value.fee)) return null;

  return value as PreparedLaunchResult;
}
