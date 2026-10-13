import { describe, expect, it } from "vitest";
import { commitmentHash, decodeBid } from "../src/bid";
import { deterministicRng, G, mulBase, N } from "../src/curve";
import { openBatches, openBid, seal, shareKey, sharedPoint, verifySealed } from "../src/seal";
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

describe("verifySealed", () => {
  it("accepts an honest seal under every pair", () => {
    expect(verifySealed(sealOne("verify"), keeperKeys)).toBe(true);
  });

  it("rejects a seal whose ciphertext was changed", () => {
    const sealed = sealOne("verify-bad");
    expect(verifySealed({ ...sealed, c: [sealed.c[0], sealed.c[1], sealed.c[2] ^ 1n] }, keeperKeys)).toBe(false);
  });

  it("rejects a seal checked against different keeper keys", () => {
    const other = [mulBase(44n), keeperKeys[1], keeperKeys[2]] as const;
    expect(verifySealed(sealOne("verify-keys"), other)).toBe(false);
  });

  const commitment = { ...domain, auctionId: 7n, bidder };

  it("accepts an honest seal checked against its commitment domain", () => {
    expect(verifySealed(sealOne("verify-h"), keeperKeys, commitment)).toBe(true);
  });

  it("rejects a seal whose h is wrong, which only the commitment check can see", () => {
    const sealed = sealOne("verify-wrong-h");
    const wrong = { ...sealed, h: commitmentHash(domain, 7n, bidder, sealed.m ^ 1n) };
    // Every pair still opens to m, so the decryption-only check passes, yet on chain this bid is forfeited.
    expect(verifySealed(wrong, keeperKeys)).toBe(true);
    expect(verifySealed(wrong, keeperKeys, commitment)).toBe(false);
  });

  it("rejects a seal checked against another chain, contract, auction or bidder", () => {
    const sealed = sealOne("verify-domain");
    expect(verifySealed(sealed, keeperKeys, { ...commitment, chainId: 143n })).toBe(false);
    expect(verifySealed(sealed, keeperKeys, { ...commitment, contract: "0x00000000000000000000000000000000000b1d01" })).toBe(false);
    expect(verifySealed(sealed, keeperKeys, { ...commitment, auctionId: 8n })).toBe(false);
    expect(verifySealed(sealed, keeperKeys, { ...commitment, bidder: "0x00000000000000000000000000000000000000b2" })).toBe(false);
  });

  it("fails closed when the commitment domain is given but h is missing", () => {
    const { R, c, m, r } = sealOne("verify-no-h");
    expect(verifySealed({ R, c, m, r }, keeperKeys, commitment)).toBe(false);
  });
});

describe("openBatches", () => {
  it("builds the openMany calldata a keeper or bidder sends, skipping opened slots", () => {
    const sealed = [sealOne("b0"), sealOne("b1"), sealOne("b2")];
    const bids = sealed.map((s, slot) => ({ slot, ephemeral: s.R, opened: slot === 1 }));
    const batches = openBatches({ publishedKeys: [secretKeys[0], 0n, secretKeys[2]], pairA: 0, pairB: 2, bids, batchSize: 1 });
    expect(batches.map((b) => b.slots)).toEqual([[0], [2]]);
    expect(batches[0]!.sharedA[0]).toEqual(sharedPoint(secretKeys[0], sealed[0]!.R));
    expect(batches[1]!.sharedB[0]).toEqual(sharedPoint(secretKeys[2], sealed[2]!.R));
  });
});
