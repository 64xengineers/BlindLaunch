import { describe, expect, it } from "vitest";
import {
  clearAuction,
  quotePerToken,
  type AuctionConfig,
  type AuctionOutcome,
  type Bid,
} from "../src/index.js";

const grid = {
  minPrice: 50n,
  stepSize: 10n,
  stepCount: 6,
};

function auction(overrides: Partial<AuctionConfig> = {}): AuctionConfig {
  return {
    supply: 1000n,
    grid,
    deposit: 1_000_000n,
    maxNotional: 1_000_000n,
    maxSlots: 8,
    ...overrides,
  };
}

function settle(config: AuctionConfig, bids: readonly Bid[]): AuctionOutcome {
  const result = clearAuction(config, bids);
  if (!result.ok) {
    throw new Error(
      `expected a clearing result (${result.issues.map((item) => item.code).join(", ")})`,
    );
  }
  return result.value;
}

function expectWithinSupply(config: AuctionConfig, bids: readonly Bid[], outcome: AuctionOutcome) {
  const total = outcome.allocations.reduce((sum, quantity) => sum + quantity, 0n);
  expect(total).toBe(outcome.totalSold);
  expect(total <= config.supply).toBe(true);
  expect(outcome.unsold).toBe(config.supply - total);
  outcome.allocations.forEach((allocation, index) => {
    const bid = bids[index];
    expect(bid).toBeDefined();
    expect(allocation >= 0n).toBe(true);
    expect(allocation <= bid!.quantity).toBe(true);
  });
  if (outcome.status === "cleared") {
    expect(outcome.clearingPrice).not.toBeNull();
    expect(outcome.proceeds).toBe(outcome.clearingPrice! * outcome.totalSold);
  }
}

describe("quote grid", () => {
  it("maps the reference steps onto 50, 60, 80, and 100", () => {
    expect(quotePerToken(grid, 0)).toBe(50n);
    expect(quotePerToken(grid, 1)).toBe(60n);
    expect(quotePerToken(grid, 3)).toBe(80n);
    expect(quotePerToken(grid, 5)).toBe(100n);
  });
});

describe("clearing price", () => {
  const referenceBids: Bid[] = [
    { slotIndex: 0, priceStep: 5, quantity: 400n },
    { slotIndex: 1, priceStep: 3, quantity: 300n },
    { slotIndex: 2, priceStep: 1, quantity: 500n },
    { slotIndex: 3, priceStep: 0, quantity: 400n },
  ];

  it("returns the four-bidder reference case", () => {
    const config = auction();
    const outcome = settle(config, referenceBids);

    expect(outcome.status).toBe("cleared");
    expect(outcome.clearingPriceStep).toBe(1);
    expect(outcome.clearingPrice).toBe(60n);
    expect(outcome.allocations).toEqual([400n, 300n, 300n, 0n]);
    expect(outcome.totalSold).toBe(1000n);
    expect(outcome.unsold).toBe(0n);
    expect(outcome.proceeds).toBe(60n * 1000n);
    expectWithinSupply(config, referenceBids, outcome);
  });

  it("sells nothing when there are no bids", () => {
    const outcome = settle(auction(), []);

    expect(outcome.status).toBe("no_demand");
    expect(outcome.clearingPriceStep).toBeNull();
    expect(outcome.clearingPrice).toBeNull();
    expect(outcome.totalSold).toBe(0n);
    expect(outcome.unsold).toBe(1000n);
    expect(outcome.proceeds).toBe(0n);
    expect(outcome.allocations).toEqual([]);
  });

  it("fills one bidder who covers the supply at that bidder's price", () => {
    const bids: Bid[] = [{ slotIndex: 0, priceStep: 4, quantity: 1000n }];
    const config = auction();
    const outcome = settle(config, bids);

    expect(outcome.clearingPrice).toBe(90n);
    expect(outcome.allocations).toEqual([1000n]);
    expect(outcome.unsold).toBe(0n);
    expect(outcome.proceeds).toBe(90n * 1000n);
    expectWithinSupply(config, bids, outcome);
  });

  it("clears an undersubscribed auction at the minimum price", () => {
    const bids: Bid[] = [
      { slotIndex: 0, priceStep: 5, quantity: 100n },
      { slotIndex: 1, priceStep: 0, quantity: 50n },
    ];
    const config = auction();
    const outcome = settle(config, bids);

    expect(outcome.status).toBe("cleared");
    expect(outcome.clearingPrice).toBe(50n);
    expect(outcome.allocations).toEqual([100n, 50n]);
    expect(outcome.totalSold).toBe(150n);
    expect(outcome.unsold).toBe(850n);
    expect(outcome.proceeds).toBe(50n * 150n);
    expectWithinSupply(config, bids, outcome);
  });

  it("fills every bid when demand equals supply", () => {
    const bids: Bid[] = [
      { slotIndex: 0, priceStep: 5, quantity: 400n },
      { slotIndex: 1, priceStep: 3, quantity: 600n },
    ];
    const config = auction();
    const outcome = settle(config, bids);

    expect(outcome.clearingPrice).toBe(80n);
    expect(outcome.allocations).toEqual([400n, 600n]);
    expect(outcome.unsold).toBe(0n);
    expect(outcome.proceeds).toBe(80n * 1000n);
    expectWithinSupply(config, bids, outcome);
  });

  it("caps a single oversized bid at the supply", () => {
    const bids: Bid[] = [{ slotIndex: 0, priceStep: 2, quantity: 250n }];
    const config = auction({ supply: 100n });
    const outcome = settle(config, bids);

    expect(outcome.clearingPrice).toBe(70n);
    expect(outcome.allocations).toEqual([100n]);
    expect(outcome.unsold).toBe(0n);
    expectWithinSupply(config, bids, outcome);
  });

  it("shares a tie at the clearing price and gives dust to the lowest slot", () => {
    const bids: Bid[] = [
      { slotIndex: 2, priceStep: 2, quantity: 40n },
      { slotIndex: 1, priceStep: 1, quantity: 50n },
      { slotIndex: 4, priceStep: 1, quantity: 30n },
      { slotIndex: 3, priceStep: 0, quantity: 100n },
    ];
    const config = auction({ supply: 100n });
    const outcome = settle(config, bids);

    expect(outcome.clearingPrice).toBe(60n);
    expect(outcome.allocations).toEqual([40n, 38n, 22n, 0n]);
    expect(outcome.totalSold).toBe(100n);
    expect(outcome.proceeds).toBe(60n * 100n);
    expectWithinSupply(config, bids, outcome);
  });

  it("gives leftover dust to an earlier slot when that slot is lower", () => {
    const bids: Bid[] = [
      { slotIndex: 2, priceStep: 2, quantity: 40n },
      { slotIndex: 1, priceStep: 1, quantity: 50n },
      { slotIndex: 0, priceStep: 1, quantity: 30n },
    ];
    const config = auction({ supply: 100n });
    const outcome = settle(config, bids);

    expect(outcome.allocations).toEqual([40n, 37n, 23n]);
    expectWithinSupply(config, bids, outcome);
  });
});

describe("rejected bids", () => {
  it("rejects zero and negative quantity", () => {
    for (const quantity of [0n, -5n]) {
      const result = clearAuction(auction(), [
        { slotIndex: 0, priceStep: 1, quantity },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.map((item) => item.code)).toContain("quantity");
      }
    }
  });

  it("rejects an out-of-range price step", () => {
    for (const priceStep of [-1, grid.stepCount]) {
      const result = clearAuction(auction(), [
        { slotIndex: 0, priceStep, quantity: 10n },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.map((item) => item.code)).toContain("price_step");
      }
    }
  });

  it("rejects a non-integer price step", () => {
    const result = clearAuction(auction(), [
      { slotIndex: 0, priceStep: 1.5, quantity: 10n },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((item) => item.code)).toContain("price_step");
    }
  });

  it("rejects a notional above the fixed deposit", () => {
    const result = clearAuction(auction({ deposit: 39_999n }), [
      { slotIndex: 0, priceStep: 5, quantity: 400n },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((item) => item.code)).toEqual(["exceeds_deposit"]);
    }
  });

  it("rejects a notional above the configured maximum", () => {
    const result = clearAuction(auction({ maxNotional: 39_999n }), [
      { slotIndex: 0, priceStep: 5, quantity: 400n },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((item) => item.code)).toEqual(["exceeds_max_notional"]);
    }
  });

  it("does not clear when one bid in the list is invalid", () => {
    const result = clearAuction(auction(), [
      { slotIndex: 0, priceStep: 5, quantity: 1000n },
      { slotIndex: 1, priceStep: 0, quantity: 0n },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("rounding and bounds", () => {
  it("spreads a one-unit remainder without overselling", () => {
    const bids: Bid[] = [
      { slotIndex: 0, priceStep: 0, quantity: 5n },
      { slotIndex: 1, priceStep: 0, quantity: 5n },
      { slotIndex: 2, priceStep: 0, quantity: 5n },
    ];
    const config = auction({
      supply: 10n,
      grid: { minPrice: 50n, stepSize: 10n, stepCount: 1 },
    });
    const outcome = settle(config, bids);

    expect(outcome.allocations).toEqual([4n, 3n, 3n]);
    expect(outcome.totalSold).toBe(10n);
    expect(outcome.unsold).toBe(0n);
    expectWithinSupply(config, bids, outcome);
  });

  it("keeps exact results for values far beyond 2^53", () => {
    const hugeGrid = {
      minPrice: 10n ** 18n,
      stepSize: 10n ** 18n,
      stepCount: 4,
    };
    const config = auction({
      supply: 10n ** 18n,
      grid: hugeGrid,
      deposit: 10n ** 40n,
      maxNotional: 10n ** 40n,
    });
    const full = settle(config, [
      { slotIndex: 0, priceStep: 3, quantity: 10n ** 18n },
    ]);
    expect(full.clearingPrice).toBe(4n * 10n ** 18n);
    expect(full.allocations).toEqual([10n ** 18n]);
    expect(full.proceeds).toBe(4n * 10n ** 36n);

    const splitBids: Bid[] = [
      { slotIndex: 0, priceStep: 0, quantity: 10n ** 18n },
      { slotIndex: 1, priceStep: 0, quantity: 10n ** 18n },
    ];
    const splitConfig = auction({
      supply: 10n ** 18n + 1n,
      grid: hugeGrid,
      deposit: 10n ** 40n,
      maxNotional: 10n ** 40n,
    });
    const split = settle(splitConfig, splitBids);
    expect(split.allocations).toEqual([5n * 10n ** 17n + 1n, 5n * 10n ** 17n]);
    expect(split.totalSold).toBe(splitConfig.supply);
    expectWithinSupply(splitConfig, splitBids, split);
  });

  it("never oversells across a small deterministic set of auctions", () => {
    const patterns: Bid[][] = [
      [{ slotIndex: 0, priceStep: 0, quantity: 1n }],
      [
        { slotIndex: 0, priceStep: 5, quantity: 3n },
        { slotIndex: 1, priceStep: 1, quantity: 4n },
        { slotIndex: 2, priceStep: 1, quantity: 4n },
        { slotIndex: 3, priceStep: 0, quantity: 9n },
      ],
      [
        { slotIndex: 1, priceStep: 4, quantity: 8n },
        { slotIndex: 0, priceStep: 4, quantity: 8n },
        { slotIndex: 2, priceStep: 2, quantity: 8n },
      ],
    ];

    for (const supply of [1n, 2n, 7n, 10n, 15n]) {
      for (const bids of patterns) {
        const config = auction({ supply });
        const outcome = settle(config, bids);
        expectWithinSupply(config, bids, outcome);
      }
    }
  });
});
