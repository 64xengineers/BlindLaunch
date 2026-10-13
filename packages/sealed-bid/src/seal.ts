import { encodePacked, keccak256, type Address, type Hex } from "viem";
import { commitmentHash, decodeBid, encodeBid, type Bid, type Domain } from "./bid";
import { bytesToBigInt, defaultRng, isValid, mul, mulBase, N, randomScalar, type Point, type Rng } from "./curve";
import { shamirReconstruct, shamirSplit, type KeeperIndex } from "./shamir";

export type Ciphertexts = readonly [bigint, bigint, bigint];

export type SealInput = Domain & {
  auctionId: bigint;
  bidder: Address;
  step: number;
  quantity: bigint;
  keeperKeys: readonly [Point, Point, Point];
};

/** What `commit` takes (`R`, `c`, `h`) plus the bidder's private record (`m`, `r`). */
export type Sealed = { R: Point; c: [bigint, bigint, bigint]; h: Hex; m: bigint; r: bigint };

export type OpenInput = Domain & {
  auctionId: bigint;
  bidder: Address;
  R: Point;
  c: Ciphertexts;
  h: Hex;
  pair: readonly [KeeperIndex, KeeperIndex];
  secretKeys: readonly [bigint, bigint];
};

export type Opened = { m: bigint; hashOk: boolean; bid: Bid | null; shared: [Point, Point] };

/** `keccak256(abi.encodePacked(S.x, S.y, uint8(index)))`. */
export function shareKey(S: Point, index: KeeperIndex): bigint {
  return BigInt(keccak256(encodePacked(["uint256", "uint256", "uint8"], [S.x, S.y, index])));
}

/** `sk·R`, the point an opener passes to `open`. */
export function sharedPoint(secretKey: bigint, R: Point): Point {
  return mul(R, secretKey);
}

/** Seals a bid. Pass the keeper keys read from `keeperKeysOf(auctionId)`, never cached ones. */
export function seal(input: SealInput, rng: Rng = defaultRng): Sealed {
  if (!input.keeperKeys.every(isValid)) throw new RangeError("invalid keeper key");
  const nonce = bytesToBigInt(rng(16));
  const m = encodeBid({ step: input.step, quantity: input.quantity, nonce });
  const shares = shamirSplit(m, rng);
  let r = randomScalar(rng);
  let R = mulBase(r);
  while (R.x >= N) {
    r = randomScalar(rng);
    R = mulBase(r);
  }
  const c: [bigint, bigint, bigint] = [
    shares[0] ^ shareKey(mul(input.keeperKeys[0], r), 0),
    shares[1] ^ shareKey(mul(input.keeperKeys[1], r), 1),
    shares[2] ^ shareKey(mul(input.keeperKeys[2], r), 2),
  ];
  return { R, c, h: commitmentHash(input, input.auctionId, input.bidder, m), m, r };
}

/** Mirrors `BlindAuctionV2._decrypt` and the hash check in `_parse`. */
export function openBid(input: OpenInput): Opened {
  const [a, b] = input.pair;
  const sharedA = sharedPoint(input.secretKeys[0], input.R);
  const sharedB = sharedPoint(input.secretKeys[1], input.R);
  const m = shamirReconstruct(a, b, input.c[a] ^ shareKey(sharedA, a), input.c[b] ^ shareKey(sharedB, b));
  const hashOk = commitmentHash(input, input.auctionId, input.bidder, m).toLowerCase() === input.h.toLowerCase();
  return { m, hashOk, bid: hashOk ? decodeBid(m) : null, shared: [sharedA, sharedB] };
}
