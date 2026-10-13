import { describe, expect, it } from "vitest";
import { BID_LIMIT, commitmentHash, decodeBid, encodeBid, MAX_NONCE, MAX_QUANTITY } from "../src/bid";

describe("bid encoding", () => {
  it("round-trips", () => {
    const bid = { step: 5, quantity: 400n, nonce: 0xdeadbeefn };
    expect(decodeBid(encodeBid(bid))).toEqual(bid);
  });

  it("puts step at bit 224 and quantity at bit 128", () => {
    expect(encodeBid({ step: 1, quantity: 0n, nonce: 0n })).toBe(1n << 224n);
    expect(encodeBid({ step: 0, quantity: 1n, nonce: 0n })).toBe(1n << 128n);
    expect(encodeBid({ step: 255, quantity: MAX_QUANTITY, nonce: MAX_NONCE })).toBe(BID_LIMIT - 1n);
  });

  it("rejects fields out of range", () => {
    expect(() => encodeBid({ step: 256, quantity: 1n, nonce: 0n })).toThrow(RangeError);
    expect(() => encodeBid({ step: -1, quantity: 1n, nonce: 0n })).toThrow(RangeError);
    expect(() => encodeBid({ step: 0, quantity: MAX_QUANTITY + 1n, nonce: 0n })).toThrow(RangeError);
    expect(() => encodeBid({ step: 0, quantity: 1n, nonce: MAX_NONCE + 1n })).toThrow(RangeError);
  });

  it("decodes nothing at or above 2^232", () => {
    expect(decodeBid(BID_LIMIT)).toBeNull();
  });

  it("hashes like keccak256(abi.encode(chainid, contract, auctionId, bidder, m))", () => {
    // cast keccak $(cast abi-encode "f(uint256,address,uint256,address,uint256)" 31337 0x00000000000000000000000000000000000b1d00 1 0x0000000000000000000000000000000000000001 2)
    const domain = { chainId: 31337n, contract: "0x00000000000000000000000000000000000b1d00" as const };
    expect(commitmentHash(domain, 1n, "0x0000000000000000000000000000000000000001", 2n)).toBe(
      "0x1f4860e573f95b5ba7c6b97e10db71a2f43a4ed2003d717c287fb06f9ab47c29",
    );
  });

  it("binds the chain and the contract", () => {
    const a = commitmentHash({ chainId: 10143n, contract: "0x00000000000000000000000000000000000b1d00" }, 1n, "0x0000000000000000000000000000000000000001", 2n);
    const b = commitmentHash({ chainId: 143n, contract: "0x00000000000000000000000000000000000b1d00" }, 1n, "0x0000000000000000000000000000000000000001", 2n);
    const c = commitmentHash({ chainId: 10143n, contract: "0x00000000000000000000000000000000000b1d01" }, 1n, "0x0000000000000000000000000000000000000001", 2n);
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
