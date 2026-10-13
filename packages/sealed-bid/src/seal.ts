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

/**
 * Proves, before sending, that a sealed bid opens to its own `m` under every keeper pair, using
 * the bidder's ephemeral secret `r` (no keeper secret needed). A bid that fails this would be
 * forfeited on chain, so the app must never send it.
 */
export function verifySealed(sealed: Pick<Sealed, "R" | "c" | "m" | "r">, keeperKeys: readonly [Point, Point, Point]): boolean {
  if (!isValid(sealed.R) || sealed.R.x >= N) return false;
  if (mulBase(sealed.r).x !== sealed.R.x || mulBase(sealed.r).y !== sealed.R.y) return false;
  const shares = ([0, 1, 2] as const).map((i) => sealed.c[i] ^ shareKey(mul(keeperKeys[i], sealed.r), i));
  const pairs: [KeeperIndex, KeeperIndex][] = [[0, 1], [0, 2], [1, 2]];
  return pairs.every(([a, b]) => shamirReconstruct(a, b, shares[a]!, shares[b]!) === sealed.m);
}

export type OpenBatch = { slots: number[]; sharedA: Point[]; sharedB: Point[] };

/** The `openMany` arguments for every unopened bid, using the frozen pair's published keys. */
export function openBatches(input: {
  publishedKeys: readonly [bigint, bigint, bigint];
  pairA: number;
  pairB: number;
  bids: readonly { slot: number; ephemeral: Point; opened: boolean }[];
  batchSize: number;
}): OpenBatch[] {
  const keyA = input.publishedKeys[input.pairA as KeeperIndex];
  const keyB = input.publishedKeys[input.pairB as KeeperIndex];
  const pending = input.bids.filter((bid) => !bid.opened);
  const out: OpenBatch[] = [];
  for (let i = 0; i < pending.length; i += input.batchSize) {
    const batch = pending.slice(i, i + input.batchSize);
    out.push({
      slots: batch.map((bid) => bid.slot),
      sharedA: batch.map((bid) => sharedPoint(keyA, bid.ephemeral)),
      sharedB: batch.map((bid) => sharedPoint(keyB, bid.ephemeral)),
    });
  }
  return out;
}
