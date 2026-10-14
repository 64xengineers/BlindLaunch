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
  /**
   * Timestamp of the latest finalized block. Never Monad's speculative latest (Proposed) block,
   * which can still be dropped (audit M3).
   */
  chainTime: bigint;
  /**
   * This host's clock, in unix seconds. Publishing also waits for it to reach commitDeadline, so a
   * single RPC endpoint reporting a wrong chain time cannot release a key early: it can only delay one.
   */
  hostTime: bigint;
};

/**
 * Keeper i publishes no earlier than `commitDeadline + i * PUBLISH_STAGGER` by chain time, so the
 * keepers do not act in lockstep: by the time keeper 2 looks, two keys are usually out already and
 * a third is never broadcast.
 */
export const PUBLISH_STAGGER = 5n;

/**
 * No key is published within this many seconds of cancelAfter by chain time: a publishKey mined at
 * or after cancelAfter reverts with the secret already in its calldata, and a lone key is useless
 * once the auction can be cancelled.
 */
export const PUBLISH_CANCEL_MARGIN = 60n;

/**
 * What to do next for one auction, in order. Pure, so the rules are unit-tested:
 * publish only between the deadline (staggered by keeper) and PUBLISH_CANCEL_MARGIN before
 * cancelAfter by chain time, only once the host clock has reached the deadline too, only for
 * auctions with bids, and never a third key; open and settle have no deadline once a pair exists;
 * cancel only when cancelAfter passed without a pair.
 */
export function nextActions(view: AuctionView, ctx: DecisionContext): Action[] {
  if (view.status === STATUS.Open) {
    if (view.publishedCount >= 2) return [view.openedCount < view.bidCount ? "open" : "settle"];
    if (ctx.chainTime >= view.cancelAfter) return ["cancel"];
    const mine = view.publishedKeys[ctx.keeper] === 0n;
    const due = ctx.chainTime >= view.commitDeadline + PUBLISH_STAGGER * BigInt(ctx.keeper) && ctx.hostTime >= view.commitDeadline;
    const safe = ctx.chainTime + PUBLISH_CANCEL_MARGIN < view.cancelAfter;
    if (ctx.haveSecret && mine && view.bidCount > 0 && due && safe) return ["publish"];
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
