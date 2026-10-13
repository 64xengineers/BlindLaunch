import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { isPowerOfTen, kuruProblem, suggestKuruParams, type KuruParams, type SeedLadder } from "../src/chain/kuru";
import { SEED, STATUS, type AuctionView, type TokenMeta } from "../src/chain/model";
import { kuruMarketHelp, kuruOffer, KuruLine, kuruStatus, resultTracker, type KuruOffer } from "../src/screens/ResultPage";

const UINT32_MAX = 2n ** 32n - 1n;
const E18 = 10n ** 18n;
const USDC: TokenMeta = { address: getAddress("0x00000000000000000000000000000000000000a5"), name: "USD Coin", symbol: "USDC", decimals: 6 };
const NCAT: TokenMeta = { address: getAddress("0x00000000000000000000000000000000000000b5"), name: "Neon Cat", symbol: "NCAT", decimals: 18 };

const html = (node: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, node)).replace(/<[^>]+>/g, "");

/* ---------- 1. the TypeScript mirror of MarketSeeder's Kuru rules ---------- */

describe("kuru params mirror the tightened MarketSeeder rules", () => {
  const ladder: SeedLadder = { minPrice: 2_500_000n, stepSize: 100_000n, stepCount: 6, lotSize: E18, saleDecimals: 18, quoteDecimals: 6 };
  const good: KuruParams = {
    sizePrecision: 100_000_000n, pricePrecision: 10_000, tickSize: 10, minSize: 1_000_000n, maxSize: 10n ** 16n,
    takerFeeBps: 30n, makerFeeBps: 10n, kuruAmmSpread: 100n,
  };

  it("accepts the seeder test parameters", () => {
    expect(kuruProblem(ladder, good)).toBeNull();
  });

  it("needs maker fee <= taker fee < 100%", () => {
    expect(kuruProblem(ladder, { ...good, makerFeeBps: 31n })).toMatch(/maker fee/);
    expect(kuruProblem(ladder, { ...good, takerFeeBps: 10_000n, makerFeeBps: 0n })).toMatch(/under 100%/);
    expect(kuruProblem(ladder, { ...good, takerFeeBps: 9_999n, makerFeeBps: 9_999n })).toBeNull();
    expect(kuruProblem(ladder, { ...good, takerFeeBps: 0n, makerFeeBps: 0n })).toBeNull();
  });

  it("needs a spread of 10 to 490 bps in steps of 10", () => {
    expect(kuruProblem(ladder, { ...good, kuruAmmSpread: 500n })).toMatch(/spread/);
    expect(kuruProblem(ladder, { ...good, kuruAmmSpread: 0n })).toMatch(/spread/);
    expect(kuruProblem(ladder, { ...good, kuruAmmSpread: 25n })).toMatch(/spread/);
    expect(kuruProblem(ladder, { ...good, kuruAmmSpread: 10n })).toBeNull();
    expect(kuruProblem(ladder, { ...good, kuruAmmSpread: 490n })).toBeNull();
  });

  it("needs the largest order strictly above the smallest", () => {
    expect(kuruProblem(ladder, { ...good, maxSize: good.minSize })).toMatch(/maximum order size/);
    expect(kuruProblem(ladder, { ...good, maxSize: good.minSize - 1n })).toMatch(/maximum order size/);
    expect(kuruProblem(ladder, { ...good, maxSize: good.minSize + 1n })).toBeNull();
  });

  it("needs power-of-ten precisions", () => {
    expect(kuruProblem(ladder, { ...good, sizePrecision: 300_000_000n })).toMatch(/powers of ten/);
    expect(kuruProblem(ladder, { ...good, pricePrecision: 25_000 })).toMatch(/powers of ten/);
    expect([1n, 10n, 100_000_000n, 10n ** 30n].every((value) => isPowerOfTen(value))).toBe(true);
    expect([0n, 2n, 20n, 110n, -10n].some((value) => isPowerOfTen(value))).toBe(false);
    expect(isPowerOfTen(1_000_000_000)).toBe(true);
    expect(isPowerOfTen(1.5)).toBe(false);
  });

  it("needs every Kuru price strictly below 2^32 - 1", () => {
    // pricePrecision 1e6 with a 6-decimal quote and whole-token lots: the Kuru price equals the raw price.
    const top: SeedLadder = { ...ladder, stepCount: 1, minPrice: UINT32_MAX };
    const params = { ...good, pricePrecision: 1_000_000, tickSize: 1 };
    expect(kuruProblem(top, params)).toMatch(/too high/);
    expect(kuruProblem({ ...top, minPrice: UINT32_MAX - 1n }, params)).toBeNull();
  });

  it("suggests a market Kuru accepts, with maxSize above minSize even for a tiny supply", () => {
    const ladders: [SeedLadder, bigint][] = [
      [ladder, 1000n * E18],
      [ladder, 10n ** 16n], // 0.01 NCAT: exactly one minimum order
      [ladder, 1n], // one wei
      [ladder, 0n],
      [{ ...ladder, minPrice: 5n * 10n ** 17n, stepSize: 10n ** 17n, quoteDecimals: 18 }, 1000n * E18],
      [{ minPrice: 2_500_000n, stepSize: 100_000n, stepCount: 6, lotSize: 1_000_000n, saleDecimals: 6, quoteDecimals: 6 }, 1n],
      [{ minPrice: 25n, stepSize: 1n, stepCount: 6, lotSize: 1n, saleDecimals: 0, quoteDecimals: 1 }, 1n],
      [ladder, 2n ** 200n],
    ];
    for (const [l, supply] of ladders) {
      const k = suggestKuruParams(l, supply);
      const label = `${l.saleDecimals}/${l.quoteDecimals} supply ${supply}`;
      expect(k.maxSize > k.minSize, label).toBe(true);
      expect(k.maxSize < 2n ** 96n, label).toBe(true);
      expect(k.makerFeeBps <= k.takerFeeBps && k.takerFeeBps < 10_000n, label).toBe(true);
      expect(isPowerOfTen(k.sizePrecision) && isPowerOfTen(k.pricePrecision), label).toBe(true);
      expect(kuruProblem(l, k), label).toBeNull();
    }
    expect(suggestKuruParams(ladder, 10n ** 16n)).toMatchObject({ minSize: 1_000_000n, maxSize: 10_000_000n });
  });
});

/* ---------- 2-4. the result page's Kuru copy ---------- */

function auction(patch: Partial<AuctionView> = {}): AuctionView {
  return {
    id: 4n, sale: NCAT, quote: USDC,
    authority: getAddress("0x00000000000000000000000000000000000000c5"),
    saleToken: NCAT.address, quoteToken: USDC.address,
    supply: 1000n * E18, lotSize: E18, supplyLots: 1000n,
    minPrice: 2_500_000n, stepSize: 100_000n, stepCount: 6,
    deposit: 1000_000_000n, maxNotional: 1000_000_000n, maxBids: 10_000,
    commitStart: 100n, commitDeadline: 200n, cancelAfter: 900n,
    status: STATUS.Settled, bidCount: 3, openedCount: 3, publishedCount: 3, pairA: 0, pairB: 0,
    clearingStep: 2, clearingPrice: 2_700_000n, aboveTotal: 0n, remaining: 0n, atDemand: 0n, totalSold: 1000n,
    forfeitedTotal: 0n, forfeitsBurned: false, unsoldReclaimed: false, proceedsReclaimed: false,
    seedSaleLots: 100n, seedQuoteBps: 2_000, seedLockUntil: 10_000n,
    seedState: SEED.HandedOff, seedSale: 0n, seedQuote: 540_000_000n,
    ...patch,
  } as AuctionView;
}

const position = (patch: Partial<{ accepted: boolean; seeded: boolean; unwound: boolean; askId: number; bidId: number }> = {}) =>
  ({ accepted: true, seeded: true, unwound: false, askId: 7, bidId: 8, ...patch });

describe("result page: what the launch put on Kuru (finding 2)", () => {
  it("reads the offer from the position", () => {
    expect(kuruOffer(position())).toBe("ask");
    expect(kuruOffer(position({ askId: 0 }))).toBe("bid");
    expect(kuruOffer(position({ askId: 0, bidId: 0 }))).toBe("none");
    expect(kuruOffer(position({ seeded: false }))).toBeNull();
    expect(kuruOffer(position({ unwound: true }))).toBeNull();
  });

  it("names a buy price only when the launch listed tokens for sale", () => {
    const line = (offer: KuruOffer) => html(createElement(KuruLine, { offer, sale: NCAT, price: "$2.700" }));
    expect(line("ask")).toBe("NCAT trades on Kuru from $2.700.");
    expect(line("bid")).toBe("Kuru only got a buy order for NCAT, one tick below $2.700.");
    expect(line("none")).not.toMatch(/\$2\.700|trades on Kuru/);
  });

  it("the live Kuru card of a sold-out launch does not claim a buy price", () => {
    const soldOut = kuruStatus(auction(), position({ askId: 0 }), 5_000n, true);
    expect(soldOut.title).toBe("Trading is live");
    expect(html(soldOut.body)).toBe("Kuru only got a buy order for NCAT, one tick below $2.70.");
    const withAsk = kuruStatus(auction({ seedSale: 100n * E18 }), position(), 5_000n, true);
    expect(html(withAsk.body)).toBe("NCAT trades on Kuru from $2.70.");
    const lockOver = kuruStatus(auction(), position({ askId: 0 }), 20_000n, true);
    expect(html(lockOver.body)).not.toMatch(/trades on Kuru from/);
  });
});

describe("result page: a seed returned without ever trading (finding 3)", () => {
  it("does not advance the tracker to Trading", () => {
    expect(resultTracker({ seeded: false, unwound: true })).toEqual({ now: "result", done: false });
    expect(resultTracker({ seeded: false, unwound: false })).toEqual({ now: "result", done: false });
    expect(resultTracker({ seeded: true, unwound: false })).toEqual({ now: "trading", done: false });
    expect(resultTracker({ seeded: true, unwound: true })).toEqual({ now: "trading", done: true });
  });

  it("says trading never started and the reserve went back to the creator", () => {
    const never = kuruStatus(auction({ seedSale: 100n * E18 }), position({ seeded: false, unwound: true, askId: 0, bidId: 0 }), 20_000n, true);
    expect(never.title).toBe("Trading never started");
    expect(html(never.body)).toMatch(/tokens and money set aside for Kuru went back to the creator/);
    expect(html(never.body)).not.toMatch(/unwound|closed/);
    const closed = kuruStatus(auction({ seedSale: 100n * E18 }), position({ unwound: true }), 20_000n, true);
    expect(closed.title).toBe("Trading on Kuru closed");
  });
});

describe("result page: any compatible Kuru market will do (finding 4)", () => {
  it("asks only for Kuru's market for the pair at a price it allows, not matching settings", () => {
    for (const kuruOnly of [true, false]) {
      const help = kuruMarketHelp(kuruOnly, NCAT, USDC, "$2.700");
      expect(help).toMatch(/NCAT\/USDC/);
      expect(help).toMatch(/settings don't need to match/);
      expect(help).toMatch(/sell order goes in at \$2\.700, or the next price step Kuru allows above it/);
      expect(help).toMatch(/A market with different settings can only be used by the creator\.$/);
    }
    expect(kuruMarketHelp(true, NCAT, USDC, "$2.700")).toMatch(/only Kuru can create a new market/);
  });
});
