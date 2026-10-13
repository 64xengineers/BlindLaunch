import type { Bid } from "./bid";

export type Ladder = { minPrice: bigint; stepSize: bigint; stepCount: number; deposit: bigint; maxNotional: bigint };

/** A bid as `open` sees it, in opening order. */
export type OpenedBid = { counted: boolean; step: number; quantity: bigint };

/** `prefix` is the counted demand at the same step opened before this bid (`Bid.prefix` on chain). */
export type CountedBid = OpenedBid & { prefix: bigint };

export type Outcome = {
  clearingStep: number;
  clearingPrice: bigint;
  aboveTotal: bigint;
  remaining: bigint;
  atDemand: bigint;
  /** True when `atDemand > remaining`: at-step bids share `remaining` pro rata. */
  proRata: boolean;
  totalSold: bigint;
};

export function priceAt(ladder: Pick<Ladder, "minPrice" | "stepSize">, step: number): bigint {
  return ladder.minPrice + BigInt(step) * ladder.stepSize;
}

/** Mirrors `BlindAuctionV2._parse` after the hash check. */
export function isCounted(bid: Bid | null, ladder: Ladder): boolean {
  if (!bid || bid.step >= ladder.stepCount || bid.quantity === 0n) return false;
  const notional = priceAt(ladder, bid.step) * bid.quantity;
  return notional <= ladder.deposit && notional <= ladder.maxNotional;
}

/** Assigns each counted bid the prefix `open` would record, given bids in opening order. */
export function withPrefixes(bids: readonly OpenedBid[]): CountedBid[] {
  const running = new Map<number, bigint>();
  return bids.map((bid) => {
    if (!bid.counted) return { ...bid, prefix: 0n };
    const prefix = running.get(bid.step) ?? 0n;
    running.set(bid.step, prefix + bid.quantity);
    return { ...bid, prefix };
  });
}

/** Mirrors `BlindAuctionV2.settle`. `qtyAtStep` is counted demand in lots per step. */
export function settleOutcome(
  qtyAtStep: readonly bigint[],
  supplyLots: bigint,
  ladder: Pick<Ladder, "minPrice" | "stepSize" | "stepCount">,
): Outcome {
  let above = 0n;
  for (let step = ladder.stepCount - 1; step >= 0; step -= 1) {
    const atStep = qtyAtStep[step] ?? 0n;
    if (above + atStep >= supplyLots) {
      const remaining = supplyLots - above;
      return {
        clearingStep: step,
        clearingPrice: priceAt(ladder, step),
        aboveTotal: above,
        remaining,
        atDemand: atStep,
        proRata: atStep > remaining,
        totalSold: supplyLots,
      };
    }
    above += atStep;
  }
  const atDemand = qtyAtStep[0] ?? 0n;
  const aboveTotal = above - atDemand;
  return {
    clearingStep: 0,
    clearingPrice: above === 0n ? 0n : priceAt(ladder, 0),
    aboveTotal,
    remaining: supplyLots - aboveTotal,
    atDemand,
    proRata: false,
    totalSold: above,
  };
}

/**
 * Mirrors `BlindAuctionV2._allocation`. At a pro-rata clearing step each bid gets
 * floor(remaining·(prefix+q)/atDemand) − floor(remaining·prefix/atDemand): the shares
 * telescope to exactly `remaining`, and each is at most `q`.
 */
export function allocationOf(bid: CountedBid, outcome: Outcome): bigint {
  if (!bid.counted || bid.step < outcome.clearingStep) return 0n;
  if (bid.step > outcome.clearingStep || !outcome.proRata) return bid.quantity;
  const { remaining, atDemand } = outcome;
  return (remaining * (bid.prefix + bid.quantity)) / atDemand - (remaining * bid.prefix) / atDemand;
}

export function totalSold(bids: readonly CountedBid[], outcome: Outcome): bigint {
  return bids.reduce((sum, bid) => sum + allocationOf(bid, outcome), 0n);
}
