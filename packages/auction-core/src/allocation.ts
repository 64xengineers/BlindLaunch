import type { ValidatedBid } from "./types.js";

function bidAt(bids: readonly ValidatedBid[], index: number): ValidatedBid {
  const bid = bids[index];
  if (bid === undefined) {
    throw new Error(`missing bid at index ${index}`);
  }
  return bid;
}

/**
 * Fills bids above `clearingStep` in full and splits the remainder across
 * bids at that step. Shares are floored, then leftover units go out in
 * ascending slot order. The result never exceeds supply or a requested quantity.
 */
export function allocateAtClearingPrice(
  supply: bigint,
  bids: readonly ValidatedBid[],
  clearingStep: number,
): bigint[] {
  const allocations: bigint[] = Array.from({ length: bids.length }, () => 0n);
  const atIndexes: number[] = [];
  let aboveTotal = 0n;

  bids.forEach((bid, index) => {
    if (bid.priceStep > clearingStep) {
      allocations[index] = bid.quantity;
      aboveTotal += bid.quantity;
    } else if (bid.priceStep === clearingStep) {
      atIndexes.push(index);
    }
  });

  if (aboveTotal > supply) {
    throw new Error("bids above the clearing price exceed supply");
  }

  const remaining = supply - aboveTotal;
  const atDemand = atIndexes.reduce(
    (sum, index) => sum + bidAt(bids, index).quantity,
    0n,
  );

  if (atDemand === 0n || remaining === 0n) {
    return allocations;
  }

  if (atDemand <= remaining) {
    for (const index of atIndexes) {
      allocations[index] = bidAt(bids, index).quantity;
    }
    return allocations;
  }

  let allocated = 0n;
  for (const index of atIndexes) {
    const quantity = bidAt(bids, index).quantity;
    const share = (remaining * quantity) / atDemand;
    allocations[index] = share;
    allocated += share;
  }

  let dust = remaining - allocated;
  const bySlot = [...atIndexes].sort(
    (left, right) => bidAt(bids, left).slotIndex - bidAt(bids, right).slotIndex,
  );

  while (dust > 0n) {
    let placed = false;
    for (const index of bySlot) {
      if (dust === 0n) {
        break;
      }
      const quantity = bidAt(bids, index).quantity;
      const current = allocations[index] ?? 0n;
      if (current < quantity) {
        allocations[index] = current + 1n;
        dust -= 1n;
        placed = true;
      }
    }
    if (!placed) {
      throw new Error("clearing dust could not be allocated without exceeding a bid");
    }
  }

  const total = allocations.reduce((sum, quantity) => sum + quantity, 0n);
  if (total > supply) {
    throw new Error("allocation exceeded supply");
  }

  return allocations;
}
