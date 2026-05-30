export type LaunchPlatform = "pumpfun" | "raydium_launchlab" | "meteora_dbc";

export type LaunchStatus =
  | "drafted"
  | "transaction_built"
  | "signed"
  | "sent"
  | "confirmed"
  | "failed"
  | "rejected_by_user";

export type TokenMetadata = {
  description: string;
  imageUri: string;
  metadataUri?: string;
};

export type LaunchDraft = {
  platform: LaunchPlatform;
  walletAddress: string;
  mintPublicKey: string;
  tokenName: string;
  tokenSymbol: string;
  tokenMetadata: TokenMetadata;
  initialBudgetSol: number;
  firstBuy?: {
    enabled: boolean;
    amountSol: number;
    slippageBps: number;
  };
  templateVersion: string;
  platformSpecificParams: Record<string, unknown>;
};

export type LaunchIssue = {
  code: string;
  message: string;
  field?: string;
};

export type FeeEstimate = {
  serviceFeeLamports: number;
  estimatedPriorityFeeLamports: number;
  estimatedRentLamports: number;
  estimatedPlatformFeeLamports: number;
  totalEstimatedLamports: number;
  feeRecipient: string;
};

export type ValidationResult = {
  ok: boolean;
  normalizedDraft?: LaunchDraft;
  errors: LaunchIssue[];
  warnings: LaunchIssue[];
  feeEstimate: FeeEstimate;
};

export type LaunchRecord = {
  id: string;
  walletAddress: string;
  platform: LaunchPlatform;
  status: LaunchStatus;
  draftSummary: Pick<LaunchDraft, "tokenName" | "tokenSymbol" | "initialBudgetSol" | "platform">;
  templateVersion: string;
  feeAmountLamports: number;
  feeRecipient: string;
  unsignedTxHash?: string;
  signature?: string;
  errorMessage?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
};

export type TransactionPayload = {
  label: string;
  description: string;
  serializedTransaction: string;
};

export type BuildTransactionResult = {
  launchRecordId: string;
  status: LaunchStatus;
  platform: LaunchPlatform;
  transactions: TransactionPayload[];
  requiredSigners: string[];
  summary: string[];
  fee: FeeEstimate;
};

export type DraftRecommendation = {
  platform: LaunchPlatform;
  confidence: number;
  reasons: string[];
  risks: string[];
  draft: LaunchDraft;
};

export type AiProviderConfig =
  | {
      type: "openai-compatible";
      baseUrl: string;
      apiKey: string;
      model: string;
    }
  | {
      type: "anthropic";
      apiKey: string;
      model: string;
      baseUrl?: string;
    };
