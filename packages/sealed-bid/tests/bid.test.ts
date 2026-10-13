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

  it("hashes like keccak256(abi.encode(uint256, address, uint256))", () => {
    // cast keccak $(cast abi-encode "f(uint256,address,uint256)" 1 0x0000000000000000000000000000000000000001 2)
    expect(commitmentHash(1n, "0x0000000000000000000000000000000000000001", 2n)).toBe(
      "0xa80034bdbb8de39fce520a04fa6876dfa52ef6776d880d540d3ad0887abb2032",
    );
  });
});
