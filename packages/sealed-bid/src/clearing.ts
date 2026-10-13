import type { Bid } from "./bid";

export type Ladder = { minPrice: bigint; stepSize: bigint; stepCount: number; deposit: bigint; maxNotional: bigint };

export type CountedBid = { counted: boolean; step: number; quantity: bigint };

export type Outcome = {
  clearingStep: number;
  clearingPrice: bigint;
  aboveTotal: bigint;
  remaining: bigint;
  atDemand: bigint;
  /** True when `atDemand > remaining`: at-step bids share `remaining` pro rata. */
  proRata: boolean;
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
  };
}

/** Mirrors `BlindAuctionV2._allocation`. */
export function allocationOf(bid: CountedBid, outcome: Outcome): bigint {
  if (!bid.counted || bid.step < outcome.clearingStep) return 0n;
  if (bid.step > outcome.clearingStep || !outcome.proRata) return bid.quantity;
  return (outcome.remaining * bid.quantity) / outcome.atDemand;
}

export function totalSold(bids: readonly CountedBid[], outcome: Outcome): bigint {
  return bids.reduce((sum, bid) => sum + allocationOf(bid, outcome), 0n);
}
