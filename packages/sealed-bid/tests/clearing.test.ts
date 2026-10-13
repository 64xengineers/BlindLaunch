import { describe, expect, it } from "vitest";
import { allocationOf, isCounted, priceAt, settleOutcome, totalSold, withPrefixes, type CountedBid, type Ladder, type OpenedBid } from "../src/clearing";

const ladder: Ladder = { minPrice: 50n, stepSize: 10n, stepCount: 6, deposit: 1_000_000n, maxNotional: 1_000_000n };

function demand(bids: readonly OpenedBid[]): bigint[] {
  const out = Array.from({ length: ladder.stepCount }, () => 0n);
  for (const bid of bids) if (bid.counted) out[bid.step] = (out[bid.step] ?? 0n) + bid.quantity;
  return out;
}

/** v1 UniformClearing: same clearing step, dust to the earliest bids. */
function referenceAllocations(bids: readonly OpenedBid[], supply: bigint): bigint[] {
  const counted = bids.filter((bid) => bid.counted);
  if (counted.length === 0) return bids.map(() => 0n);
  let step = 0;
  for (let s = ladder.stepCount - 1; s >= 0; s -= 1) {
    const d = counted.filter((bid) => bid.step >= s).reduce((sum, bid) => sum + bid.quantity, 0n);
    if (d >= supply) { step = s; break; }
  }
  const above = counted.filter((bid) => bid.step > step).reduce((sum, bid) => sum + bid.quantity, 0n);
  const at = bids.map((bid, i) => ({ bid, i })).filter(({ bid }) => bid.counted && bid.step === step);
  const atDemand = at.reduce((sum, { bid }) => sum + bid.quantity, 0n);
  const remaining = supply - above;
  const alloc = bids.map((bid) => (bid.counted && bid.step > step ? bid.quantity : 0n));
  if (atDemand <= remaining) {
    for (const { bid, i } of at) alloc[i] = bid.quantity;
    return alloc;
  }
  let given = 0n;
  for (const { bid, i } of at) { alloc[i] = (remaining * bid.quantity) / atDemand; given += alloc[i] ?? 0n; }
  let dust = remaining - given;
  while (dust > 0n) for (const { bid, i } of at) if (dust > 0n && (alloc[i] ?? 0n) < bid.quantity) { alloc[i] = (alloc[i] ?? 0n) + 1n; dust -= 1n; }
  return alloc;
}

describe("clearing", () => {
  it("prices the ladder", () => {
    expect(priceAt(ladder, 0)).toBe(50n);
    expect(priceAt(ladder, 5)).toBe(100n);
  });

  it("counts only valid bids", () => {
    expect(isCounted({ step: 5, quantity: 10_000n, nonce: 0n }, ladder)).toBe(true);
    expect(isCounted({ step: 6, quantity: 1n, nonce: 0n }, ladder)).toBe(false);
    expect(isCounted({ step: 0, quantity: 0n, nonce: 0n }, ladder)).toBe(false);
    expect(isCounted({ step: 5, quantity: 10_001n, nonce: 0n }, ladder)).toBe(false);
    expect(isCounted(null, ladder)).toBe(false);
    expect(isCounted({ step: 0, quantity: 100n, nonce: 0n }, { ...ladder, maxNotional: 4_999n })).toBe(false);
  });

  it("clears the reference example at 60 with everything sold", () => {
    const bids: CountedBid[] = withPrefixes([
      { counted: true, step: 5, quantity: 400n },
      { counted: true, step: 3, quantity: 300n },
      { counted: true, step: 1, quantity: 500n },
      { counted: true, step: 0, quantity: 400n },
    ]);
    const outcome = settleOutcome(demand(bids), 1000n, ladder);
    expect(outcome).toMatchObject({ clearingStep: 1, clearingPrice: 60n, aboveTotal: 700n, remaining: 300n, atDemand: 500n, proRata: true, totalSold: 1000n });
    expect(bids.map((bid) => allocationOf(bid, outcome))).toEqual([400n, 300n, 300n, 0n]);
    expect(totalSold(bids, outcome)).toBe(1000n);
  });

  it("sells everything counted at the floor when undersubscribed", () => {
    const bids = withPrefixes([{ counted: true, step: 5, quantity: 100n }, { counted: true, step: 0, quantity: 50n }]);
    const outcome = settleOutcome(demand(bids), 1000n, ladder);
    expect(outcome).toMatchObject({ clearingStep: 0, clearingPrice: 50n, proRata: false, totalSold: 150n });
    expect(totalSold(bids, outcome)).toBe(150n);
  });

  it("prices nothing when nothing counted", () => {
    const outcome = settleOutcome(demand([]), 1000n, ladder);
    expect(outcome).toMatchObject({ clearingStep: 0, clearingPrice: 0n, atDemand: 0n, proRata: false, totalSold: 0n });
  });

  it("sells exactly the remaining supply at the clearing step (cumulative rounding)", () => {
    const bids = withPrefixes([4n, 4n, 4n].map((quantity) => ({ counted: true, step: 2, quantity })));
    const outcome = settleOutcome(demand(bids), 10n, ladder);
    expect(bids.map((bid) => allocationOf(bid, outcome))).toEqual([3n, 3n, 4n]);
    expect(totalSold(bids, outcome)).toBe(10n);
    expect(outcome.totalSold).toBe(10n);
  });

  it("sells the single lot when two 1-lot bids compete for it (audit H3)", () => {
    const bids = withPrefixes([1n, 1n].map((quantity) => ({ counted: true, step: 2, quantity })));
    const outcome = settleOutcome(demand(bids), 1n, ladder);
    expect(totalSold(bids, outcome)).toBe(1n);
  });

  it("a 1-lot sybil cannot shrink the sale (audit H3)", () => {
    const bids = withPrefixes([2n, 2n, 2n, 2n, 2n, 1n].map((quantity) => ({ counted: true, step: 2, quantity })));
    const outcome = settleOutcome(demand(bids), 10n, ladder);
    expect(totalSold(bids, outcome)).toBe(10n);
    bids.forEach((bid) => expect(allocationOf(bid, outcome) <= bid.quantity).toBe(true));
  });

  it("only counted bids at the same step build each other's prefix", () => {
    const bids = withPrefixes([
      { counted: true, step: 1, quantity: 5n },
      { counted: false, step: 1, quantity: 9n },
      { counted: true, step: 2, quantity: 7n },
      { counted: true, step: 1, quantity: 3n },
    ]);
    expect(bids.map((bid) => bid.prefix)).toEqual([0n, 0n, 0n, 5n]);
  });

  it("matches v1 clearing within one lot per bid with the same total on 2,000 random books", () => {
    let seed = 12345;
    const next = (limit: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % limit; };
    for (let run = 0; run < 2000; run += 1) {
      const supply = BigInt(1 + next(3000));
      const bids = withPrefixes(Array.from({ length: 1 + next(8) }, () => ({ counted: next(5) !== 0, step: next(6), quantity: BigInt(1 + next(2000)) })));
      const outcome = settleOutcome(demand(bids), supply, ladder);
      const reference = referenceAllocations(bids, supply);
      bids.forEach((bid, i) => {
        const ours = allocationOf(bid, outcome);
        const theirs = reference[i] ?? 0n;
        expect(ours - theirs <= 1n && theirs - ours <= 1n).toBe(true);
        expect(ours <= bid.quantity).toBe(true);
      });
      const sold = totalSold(bids, outcome);
      expect(sold).toBe(reference.reduce((sum, value) => sum + value, 0n));
      expect(sold).toBe(outcome.totalSold);
    }
  });
});
