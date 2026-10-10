import { allocateAtClearingPrice } from "./allocation.js";
import type { AuctionConfig, AuctionOutcome, Bid, ValidatedBid, ValidationResult } from "./types.js";
import { quotePerToken, validateBids } from "./validation.js";

function demandAt(step: number, bids: readonly ValidatedBid[]): bigint {
  return bids.reduce(
    (sum, bid) => (bid.priceStep >= step ? sum + bid.quantity : sum),
    0n,
  );
}

/**
 * Highest step whose demand covers `supply`.
 * When no step does, the auction is undersubscribed and clears at step 0.
 */
export function findClearingStep(
  supply: bigint,
  stepCount: number,
  bids: readonly ValidatedBid[],
): number {
  for (let step = stepCount - 1; step >= 0; step -= 1) {
    if (demandAt(step, bids) >= supply) {
      return step;
    }
  }
  return 0;
}

export function clearAuction(
  config: AuctionConfig,
  bids: readonly Bid[],
): ValidationResult<AuctionOutcome> {
  const validated = validateBids(config, bids);
  if (!validated.ok) {
    return validated;
  }

  if (validated.value.length === 0) {
    return {
      ok: true,
      value: {
        status: "no_demand",
        clearingPriceStep: null,
        clearingPrice: null,
        totalSold: 0n,
        unsold: config.supply,
        proceeds: 0n,
        allocations: [],
      },
    };
  }

  const clearingPriceStep = findClearingStep(
    config.supply,
    config.grid.stepCount,
    validated.value,
  );
  const allocations = allocateAtClearingPrice(
    config.supply,
    validated.value,
    clearingPriceStep,
  );
  const totalSold = allocations.reduce((sum, quantity) => sum + quantity, 0n);
  if (totalSold > config.supply) {
    throw new Error("allocation exceeded supply");
  }

  const clearingPrice = quotePerToken(config.grid, clearingPriceStep);
  return {
    ok: true,
    value: {
      status: "cleared",
      clearingPriceStep,
      clearingPrice,
      totalSold,
      unsold: config.supply - totalSold,
      proceeds: clearingPrice * totalSold,
      allocations,
    },
  };
}
