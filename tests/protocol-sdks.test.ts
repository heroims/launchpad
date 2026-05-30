import { describe, expect, it } from "vitest";
import { getProtocolSdkDescriptor } from "@/lib/launch/protocol-sdks";

describe("protocol SDK descriptors", () => {
  it("maps pump.fun to the official create and first-buy methods", () => {
    const descriptor = getProtocolSdkDescriptor("pumpfun");

    expect(descriptor.packageName).toBe("@pump-fun/pump-sdk");
    expect(descriptor.createOnlyMethod).toBe("PumpSdk.createV2Instruction");
    expect(descriptor.createWithFirstBuyMethod).toBe("PumpSdk.createV2AndBuyInstructions");
    expect(descriptor.requiresMintSigner).toBe(true);
  });

  it("maps Raydium and Meteora to first-buy capable launch methods", () => {
    expect(getProtocolSdkDescriptor("raydium_launchlab").createWithFirstBuyMethod).toBe("raydium.launchpad.createLaunchpad(createOnly=false)");
    expect(getProtocolSdkDescriptor("meteora_dbc").createWithFirstBuyMethod).toBe("DynamicBondingCurveClient.pool.createPoolWithFirstBuy");
  });
});
