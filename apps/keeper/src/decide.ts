export const STATUS = { None: 0, Open: 1, Settled: 2, Cancelled: 3 } as const;
export const SEED = { None: 0, Reserved: 1, HandedOff: 2, Released: 3 } as const;

export type KeeperIndex = 0 | 1 | 2;

export type Action = "publish" | "open" | "settle" | "cancel" | "handOffSeed" | "burnForfeits" | "retrySeed";

/** The fields of `BlindAuctionV2.getAuction` and `publishedKeysOf` a keeper decides on. */
export type AuctionView = {
  id: bigint;
  status: number;
  bidCount: number;
  openedCount: number;
  publishedCount: number;
  pairA: number;
  pairB: number;
  commitDeadline: bigint;
  cancelAfter: bigint;
  seedState: number;
  forfeitedTotal: bigint;
  forfeitsBurned: boolean;
  publishedKeys: readonly [bigint, bigint, bigint];
};

export type DecisionContext = {
  keeper: KeeperIndex;
  /** Whether this keeper holds the secret for its key in this auction. */
  haveSecret: boolean;
  /** Timestamp of the latest block. Never the local clock (audit M3). */
  chainTime: bigint;
};

/**
 * What to do next for one auction, in order. Pure, so the rules are unit-tested:
 * publish only between the deadline and cancelAfter by chain time, only for auctions with bids,
 * and never a third key; open and settle have no deadline once a pair exists; cancel only when
 * cancelAfter passed without a pair.
 */
export function nextActions(view: AuctionView, ctx: DecisionContext): Action[] {
  if (view.status === STATUS.Open) {
    if (view.publishedCount >= 2) return [view.openedCount < view.bidCount ? "open" : "settle"];
    if (ctx.chainTime >= view.cancelAfter) return ["cancel"];
    const mine = view.publishedKeys[ctx.keeper] === 0n;
    if (ctx.haveSecret && mine && view.bidCount > 0 && ctx.chainTime >= view.commitDeadline) return ["publish"];
    return [];
  }
  if (view.status === STATUS.Settled) {
    const actions: Action[] = [];
    if (view.seedState === SEED.Reserved) actions.push("handOffSeed");
    if (view.forfeitedTotal > 0n && !view.forfeitsBurned) actions.push("burnForfeits");
    if (view.seedState === SEED.HandedOff) actions.push("retrySeed");
    return actions;
  }
  return [];
}

export function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
