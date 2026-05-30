import { describe, expect, it } from "vitest";
import { generateLaunchMintKeypair, restoreLaunchMintKeypair } from "@/lib/wallet/mint-keypair";

describe("launch mint keypair helper", () => {
  it("generates a mint keypair that can be restored from an encoded secret", () => {
    const generated = generateLaunchMintKeypair();
    const restored = restoreLaunchMintKeypair(generated.secretKeyBase64);

    expect(generated.publicKey).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(restored.publicKey).toBe(generated.publicKey);
  });
});
