import { describe, expect, it } from "vitest";

describe("protocol SDK imports", () => {
  it("loads the official pump.fun SDK exports", async () => {
    const sdk = await import("@pump-fun/pump-sdk");

    expect(sdk.PumpSdk).toBeTypeOf("function");
    expect(sdk.OnlinePumpSdk).toBeTypeOf("function");
    expect(sdk.getBuyTokenAmountFromSolAmount).toBeTypeOf("function");
  });

  it("loads Raydium LaunchLab SDK exports", async () => {
    const sdk = await import("@raydium-io/raydium-sdk-v2");

    expect(sdk.Raydium).toBeTypeOf("function");
    expect(sdk.TxVersion).toBeDefined();
    expect(sdk.getPdaLaunchpadConfigId).toBeTypeOf("function");
  });

  it("loads Meteora DBC SDK exports", async () => {
    const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");

    expect(sdk.DynamicBondingCurveClient).toBeTypeOf("function");
    expect(sdk.buildCurve).toBeTypeOf("function");
    expect(sdk.MigrationOption).toBeDefined();
  });
});
