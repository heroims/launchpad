import { describe, expect, it } from "vitest";
import { publicKeyToString } from "@/lib/wallet/browser-wallet";

function publicKey(value: string) {
  return {
    toBase58: () => value
  };
}

describe("publicKeyToString", () => {
  it("returns null for null input", () => {
    expect(publicKeyToString(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(publicKeyToString(undefined)).toBeNull();
  });

  it("returns the string as-is for string input", () => {
    expect(publicKeyToString("abc")).toBe("abc");
  });

  it("calls toBase58 on objects with that method", () => {
    expect(publicKeyToString(publicKey("pk-123"))).toBe("pk-123");
  });

  it("calls toString on objects without toBase58", () => {
    expect(publicKeyToString({ toString: () => "fallback" })).toBe("fallback");
  });
});
