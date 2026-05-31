import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { encodeLaunchMintKeypair } from "@/lib/wallet/mint-keypair";
import { signAndSendLaunchTransactionsWithWallet, signLaunchTransactions, sendSignedTransactionsSequentially } from "@/lib/wallet/launch-signing";

const blockhash = "11111111111111111111111111111111";

function serializeUnsigned(transaction: Transaction): string {
  return transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}

describe("launch transaction signing", () => {
  it("signs required mint keypairs locally before wallet signing", async () => {
    const payer = Keypair.generate();
    const mint = Keypair.generate();
    const transaction = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(
      new TransactionInstruction({
        programId: SystemProgram.programId,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: mint.publicKey, isSigner: true, isWritable: true }
        ],
        data: Buffer.alloc(0)
      })
    );

    const [signed] = await signLaunchTransactions({
      transactions: [{ label: "launch", description: "test", serializedTransaction: serializeUnsigned(transaction) }],
      requiredSigners: [mint.publicKey.toBase58()],
      mintSecretKeyBase64: encodeLaunchMintKeypair(mint).secretKeyBase64,
      recentBlockhash: blockhash,
      wallet: {
        publicKey: payer.publicKey,
        signTransaction: async (tx) => {
          tx.partialSign(payer);
          return tx;
        }
      }
    });

    expect(signed.signatures.find((signature) => signature.publicKey.equals(payer.publicKey))?.signature).toBeTruthy();
    expect(signed.signatures.find((signature) => signature.publicKey.equals(mint.publicKey))?.signature).toBeTruthy();
  });

  it("does not require the mint secret when the transaction message does not need that signer", async () => {
    const payer = Keypair.generate();
    const mint = Keypair.generate();
    const transaction = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: PublicKey.default,
        lamports: 1
      })
    );

    const [signed] = await signLaunchTransactions({
      transactions: [{ label: "fee", description: "test", serializedTransaction: serializeUnsigned(transaction) }],
      requiredSigners: [mint.publicKey.toBase58()],
      recentBlockhash: blockhash,
      wallet: {
        publicKey: payer.publicKey,
        signTransaction: async (tx) => {
          tx.partialSign(payer);
          return tx;
        }
      }
    });

    expect(signed.signatures.find((signature) => signature.publicKey.equals(payer.publicKey))?.signature).toBeTruthy();
  });

  it("sends signed transactions in order", async () => {
    const payer = Keypair.generate();
    const transactions = [1, 2].map((lamports) => {
      const transaction = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: PublicKey.default,
          lamports
        })
      );
      transaction.partialSign(payer);
      return transaction;
    });
    const calls: number[] = [];
    const signatures = await sendSignedTransactionsSequentially(transactions, async (_raw, index) => {
      calls.push(index);
      return `signature-${index}`;
    });

    expect(calls).toEqual([0, 1]);
    expect(signatures).toEqual(["signature-0", "signature-1"]);
  });

  it("uses the browser wallet to sign and send prepared transactions", async () => {
    const payer = Keypair.generate();
    const mint = Keypair.generate();
    const transaction = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(
      new TransactionInstruction({
        programId: SystemProgram.programId,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: mint.publicKey, isSigner: true, isWritable: true }
        ],
        data: Buffer.alloc(0)
      })
    );
    const walletCalls: Transaction[] = [];

    const signatures = await signAndSendLaunchTransactionsWithWallet({
      transactions: [{ label: "launch", description: "test", serializedTransaction: serializeUnsigned(transaction) }],
      requiredSigners: [mint.publicKey.toBase58()],
      mintSecretKeyBase64: encodeLaunchMintKeypair(mint).secretKeyBase64,
      wallet: {
        publicKey: payer.publicKey,
        signAndSendTransaction: async (tx) => {
          expect(tx.signatures.find((signature) => signature.publicKey.equals(mint.publicKey))?.signature).toBeTruthy();
          tx.partialSign(payer);
          walletCalls.push(tx);
          return { signature: "wallet-signature-0" };
        }
      }
    });

    expect(walletCalls).toHaveLength(1);
    expect(signatures).toEqual(["wallet-signature-0"]);
  });
});
