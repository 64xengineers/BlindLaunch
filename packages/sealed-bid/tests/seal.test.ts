import { describe, expect, it } from "vitest";
import { decodeBid } from "../src/bid";
import { deterministicRng, G, mulBase, N } from "../src/curve";
import { openBid, seal, shareKey } from "../src/seal";
import type { KeeperIndex } from "../src/shamir";

const secretKeys = [11n, 22n, 33n] as const;
const keeperKeys = [mulBase(11n), mulBase(22n), mulBase(33n)] as const;
const bidder = "0x00000000000000000000000000000000000000b1" as const;
const pairs: [KeeperIndex, KeeperIndex][] = [[0, 1], [0, 2], [1, 2]];
const domain = { chainId: 10143n, contract: "0x00000000000000000000000000000000000b1d00" } as const;

function sealOne(rngSeed: string) {
  return seal({ ...domain, auctionId: 7n, bidder, step: 3, quantity: 250n, keeperKeys }, deterministicRng(rngSeed));
}

describe("seal and open", () => {
  it("matches the Solidity share key: keccak256(abi.encodePacked(x, y, uint8 i))", () => {
    // cast keccak $(cast concat-hex $(cast to-uint256 $GX) $(cast to-uint256 $GY) 0x01)
    expect(shareKey(G, 1)).toBe(0xe328175e66eda9cbe0529a0e5053288264e027fbb4751ab5e64a82ffb3a1208bn);
  });

  it("opens with every keeper pair", () => {
    const sealed = sealOne("pairs");
    for (const [a, b] of pairs) {
      const opened = openBid({
        ...domain, auctionId: 7n, bidder, R: sealed.R, c: sealed.c, h: sealed.h,
        pair: [a, b], secretKeys: [secretKeys[a], secretKeys[b]],
      });
      expect(opened.hashOk).toBe(true);
      expect(opened.m).toBe(sealed.m);
      expect(opened.bid).toEqual(decodeBid(sealed.m));
      expect(opened.bid?.step).toBe(3);
      expect(opened.bid?.quantity).toBe(250n);
    }
  });

  it("keeps the ephemeral x below n so ecrecover accepts it", () => {
    expect(sealOne("rx").R.x < N).toBe(true);
  });

  it("fails the hash check for another bidder", () => {
    const sealed = sealOne("copy");
    const opened = openBid({
      ...domain, auctionId: 7n, bidder: "0x00000000000000000000000000000000000000b2", R: sealed.R, c: sealed.c, h: sealed.h,
      pair: [0, 1], secretKeys: [secretKeys[0], secretKeys[1]],
    });
    expect(opened.hashOk).toBe(false);
    expect(opened.bid).toBeNull();
  });

  it("fails the hash check when a ciphertext is corrupted", () => {
    const sealed = sealOne("corrupt");
    const c: [bigint, bigint, bigint] = [sealed.c[0], sealed.c[1] ^ 1n, sealed.c[2]];
    const opened = openBid({
      ...domain, auctionId: 7n, bidder, R: sealed.R, c, h: sealed.h, pair: [0, 1], secretKeys: [secretKeys[0], secretKeys[1]],
    });
    expect(opened.hashOk).toBe(false);
  });

  it("never repeats ciphertexts for the same bid", () => {
    expect(sealOne("a").c[0]).not.toBe(sealOne("b").c[0]);
  });

  it("fails the hash check on another chain or contract", () => {
    const sealed = sealOne("domain");
    const base = { auctionId: 7n, bidder, R: sealed.R, c: sealed.c, h: sealed.h, pair: [0, 1] as const, secretKeys: [secretKeys[0], secretKeys[1]] as const };
    expect(openBid({ ...base, chainId: 143n, contract: domain.contract }).hashOk).toBe(false);
    expect(openBid({ ...base, chainId: domain.chainId, contract: "0x00000000000000000000000000000000000b1d01" }).hashOk).toBe(false);
  });

  it("refuses invalid keeper keys", () => {
    const bad = [keeperKeys[0], { x: keeperKeys[1].x, y: keeperKeys[1].y + 1n }, keeperKeys[2]] as const;
    expect(() => seal({ ...domain, auctionId: 7n, bidder, step: 0, quantity: 1n, keeperKeys: bad }, deterministicRng("bad"))).toThrow(RangeError);
  });
});
