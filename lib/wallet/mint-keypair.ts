import { Keypair } from "@solana/web3.js";

export type EncodedLaunchMintKeypair = {
  publicKey: string;
  secretKeyBase64: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer === "undefined") {
    return btoa(String.fromCharCode(...bytes));
  }
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer === "undefined") {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(value, "base64"));
}

export function encodeLaunchMintKeypair(keypair: Keypair): EncodedLaunchMintKeypair {
  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKeyBase64: bytesToBase64(keypair.secretKey)
  };
}

export function generateLaunchMintKeypair(): EncodedLaunchMintKeypair {
  return encodeLaunchMintKeypair(Keypair.generate());
}

export function restoreLaunchMintKeypair(secretKeyBase64: string): EncodedLaunchMintKeypair {
  return encodeLaunchMintKeypair(Keypair.fromSecretKey(base64ToBytes(secretKeyBase64)));
}
