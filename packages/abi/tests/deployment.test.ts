import { describe, expect, it } from "vitest";
import { parseDeployment } from "../src/deployment";

const valid = {
  chainId: 10143,
  deployBlock: 123,
  registry: "0x00000000000000000000000000000000000000a1",
  auction: "0x00000000000000000000000000000000000000a2",
  seeder: "0x00000000000000000000000000000000000000a3",
  factory: "0x00000000000000000000000000000000000000a4",
  quote: "0x00000000000000000000000000000000000000a5",
};

describe("parseDeployment", () => {
  it("reads what DeployV2 writes", () => {
    const d = parseDeployment(valid);
    expect(d.chainId).toBe(10143);
    expect(d.deployBlock).toBe(123n);
    expect(d.auction).toBe("0x00000000000000000000000000000000000000A2");
  });

  it("rejects a missing or malformed address", () => {
    expect(() => parseDeployment({ ...valid, seeder: "0x1234" })).toThrow(/seeder/);
    const { quote: _quote, ...withoutQuote } = valid;
    expect(() => parseDeployment(withoutQuote)).toThrow(/quote/);
  });

  it("rejects a bad chain id", () => {
    expect(() => parseDeployment({ ...valid, chainId: 0 })).toThrow(/chainId/);
  });
});
