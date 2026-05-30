import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { publicKeyToString, type SolanaBrowserWalletProvider } from "./browser-wallet";
import type { TransactionPayload } from "@/lib/launch/types";

export type LaunchWalletSigner = Pick<SolanaBrowserWalletProvider, "publicKey" | "signTransaction" | "signAllTransactions">;

type SignLaunchTransactionsInput = {
  transactions: TransactionPayload[];
  requiredSigners: string[];
  wallet: LaunchWalletSigner;
  mintSecretKeyBase64?: string | null;
  recentBlockhash?: string;
};

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(value, "base64"));
  }
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function transactionFromPayload(payload: TransactionPayload, recentBlockhash?: string): Transaction {
  const transaction = Transaction.from(base64ToBytes(payload.serializedTransaction));
  if (recentBlockhash) transaction.recentBlockhash = recentBlockhash;
  return transaction;
}

function requiredSignatureKeys(transaction: Transaction): PublicKey[] {
  const message = transaction.compileMessage();
  return message.accountKeys.slice(0, message.header.numRequiredSignatures);
}

function transactionRequiresSigner(transaction: Transaction, signer: PublicKey): boolean {
  return requiredSignatureKeys(transaction).some((key) => key.equals(signer));
}

function restoreMintSigner(mintSecretKeyBase64?: string | null): Keypair | null {
  if (!mintSecretKeyBase64) return null;
  return Keypair.fromSecretKey(base64ToBytes(mintSecretKeyBase64));
}

function assertLocalSignersAvailable(transactions: Transaction[], requiredSigners: string[], wallet: LaunchWalletSigner, mintSigner: Keypair | null) {
  const walletAddress = publicKeyToString(wallet.publicKey);
  for (const signer of requiredSigners) {
    if (walletAddress === signer || mintSigner?.publicKey.toBase58() === signer) continue;
    const signerKey = new PublicKey(signer);
    const isNeeded = transactions.some((transaction) => transactionRequiresSigner(transaction, signerKey));
    if (isNeeded) {
      throw new Error(`Missing local signer for required launch signer: ${signer}`);
    }
  }
}

export async function signLaunchTransactions(input: SignLaunchTransactionsInput): Promise<Transaction[]> {
  const transactions = input.transactions.map((payload) => transactionFromPayload(payload, input.recentBlockhash));
  const mintSigner = restoreMintSigner(input.mintSecretKeyBase64);
  assertLocalSignersAvailable(transactions, input.requiredSigners, input.wallet, mintSigner);

  if (mintSigner) {
    for (const transaction of transactions) {
      if (transactionRequiresSigner(transaction, mintSigner.publicKey)) {
        transaction.partialSign(mintSigner);
      }
    }
  }

  if (input.wallet.signAllTransactions && transactions.length > 1) {
    return input.wallet.signAllTransactions(transactions);
  }
  if (input.wallet.signTransaction) {
    const signed: Transaction[] = [];
    for (const transaction of transactions) {
      signed.push(await input.wallet.signTransaction(transaction));
    }
    return signed;
  }
  if (input.wallet.signAllTransactions) {
    return input.wallet.signAllTransactions(transactions);
  }

  throw new Error("Connected wallet does not support transaction signing.");
}

export async function sendSignedTransactionsSequentially(
  transactions: Transaction[],
  sendRawTransaction: (rawTransaction: Uint8Array, index: number) => Promise<string>
): Promise<string[]> {
  const signatures: string[] = [];
  for (const [index, transaction] of transactions.entries()) {
    const raw = transaction.serialize();
    signatures.push(await sendRawTransaction(new Uint8Array(raw), index));
  }
  return signatures;
}
