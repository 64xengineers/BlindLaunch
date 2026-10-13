import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { STATUS, type AuctionView, type BidView, type Phase, type TokenMeta } from "../src/chain/model";
import { AMOUNT_STEPS, bidReceipt, cleanLots, lotsForSpend, lotsOf, spendCap, spendPresets } from "../src/chain/receipt";
import { moneyText, outcomeOf, priceText, tokensText, trackerOf, wholeLots } from "../src/components/auction";
import { lootOf, money } from "../src/screens/ResultPage";

const USDC: TokenMeta = { address: getAddress("0x00000000000000000000000000000000000000a5"), name: "USD Coin", symbol: "USDC", decimals: 6 };
const USDM: TokenMeta = { address: getAddress("0x00000000000000000000000000000000000000a6"), name: "USD Money", symbol: "USDM", decimals: 18 };
const WMON: TokenMeta = { address: getAddress("0x00000000000000000000000000000000000000a7"), name: "Wrapped MON", symbol: "WMON", decimals: 18 };
const NCAT: TokenMeta = { address: getAddress("0x00000000000000000000000000000000000000b5"), name: "Neon Cat", symbol: "NCAT", decimals: 18 };
const TKN6: TokenMeta = { address: getAddress("0x00000000000000000000000000000000000000b6"), name: "Six", symbol: "TKN", decimals: 6 };

const E18 = 10n ** 18n;
const usd = (dollars: number) => BigInt(Math.round(dollars * 100)) * 10_000n; // 6-decimal dollars

/** $2.50 + $0.10 a step, six steps, $1,000 bid money, whole NCAT lots, USDC quote. */
function auction(patch: Partial<AuctionView> = {}): AuctionView {
  return {
    id: 4n,
    sale: NCAT,
    quote: USDC,
    authority: getAddress("0x00000000000000000000000000000000000000c5"),
    saleToken: NCAT.address,
    quoteToken: USDC.address,
    supply: 1000n * E18,
    lotSize: E18,
    supplyLots: 1000n,
    minPrice: usd(2.5),
    stepSize: usd(0.1),
    stepCount: 6,
    deposit: usd(1000),
    maxNotional: usd(1000),
    maxBids: 10_000,
    commitStart: 100n,
    commitDeadline: 200n,
    cancelAfter: 900n,
    status: STATUS.Open,
    bidCount: 0,
    openedCount: 0,
    publishedCount: 0,
    pairA: 0,
    pairB: 0,
    clearingStep: 0,
    clearingPrice: 0n,
    aboveTotal: 0n,
    remaining: 0n,
    atDemand: 0n,
    totalSold: 0n,
    forfeitedTotal: 0n,
    forfeitsBurned: false,
    unsoldReclaimed: false,
    proceedsReclaimed: false,
    seedSaleLots: 0n,
    seedQuoteBps: 0,
    seedLockUntil: 0n,
    seedState: 0,
    seedSale: 0n,
    seedQuote: 0n,
    ...patch,
  } as AuctionView;
}

/* ---------- the bid receipt ---------- */

describe("bid receipt", () => {
  it("$500 at $2.70 buys 185 tokens, pays at most $499.50 and $500.50 comes back for sure", () => {
    const a = auction();
    const presets = spendPresets(a, USDC);
    expect(presets.map((p) => p.key)).toEqual(["100", "250", "500", "max"]);
    expect(presets.map((p) => p.label)).toEqual(["$100", "$250", "$500", "MAX"]);
    expect(presets.map((p) => p.spend)).toEqual([usd(100), usd(250), usd(500), usd(1000)]);

    const lots = lotsForSpend(a, usd(500), 2);
    expect(lots).toBe(185n);
    const r = bidReceipt(a, 2, lots);
    expect(r.price).toBe(usd(2.7));
    expect(r.tokens).toBe(185n * E18);
    expect(r.maxPay).toBe(usd(499.5));
    expect(r.back).toBe(usd(500.5));
    expect(r).toMatchObject({ cap: usd(1000), maxLots: 370n, over: false, valid: true });
    expect(tokensText(a, lots)).toBe("185 NCAT");
    expect(moneyText(r.maxPay, USDC)).toBe("$499.50");
    expect(moneyText(r.back, USDC)).toBe("$500.50");
    expect(r.maxPay + r.back).toBe(a.deposit);
  });

  it("MAX spends the whole cap, rounded down to whole lots", () => {
    const a = auction();
    const max = spendPresets(a, USDC).at(-1)!;
    expect(max).toEqual({ key: "max", label: "MAX", spend: usd(1000) });
    // $1,000 / $2.70 = 370.37 -> 370 lots, $999.00, $1.00 back.
    expect(lotsForSpend(a, max.spend, 2)).toBe(370n);
    expect(bidReceipt(a, 2, 370n)).toMatchObject({ maxPay: usd(999), back: usd(1), over: false, valid: true });
    // $1,000 / $2.50 is exact: everything is at risk, nothing comes back for sure, still valid.
    expect(lotsForSpend(a, max.spend, 0)).toBe(400n);
    expect(bidReceipt(a, 0, 400n)).toMatchObject({ maxPay: usd(1000), back: 0n, over: false, valid: true });
    expect(bidReceipt(a, 0, 401n)).toMatchObject({ over: true, valid: false });
  });

  it("caps spend at maxNotional when it is below the deposit, while the whole deposit is still locked", () => {
    const a = auction({ maxNotional: usd(300) });
    expect(spendCap(a)).toBe(usd(300));
    const presets = spendPresets(a, USDC);
    expect(presets.map((p) => p.key)).toEqual(["100", "250", "max"]);
    expect(presets.at(-1)!.spend).toBe(usd(300));
    const lots = lotsForSpend(a, usd(300), 2);
    expect(lots).toBe(111n);
    expect(bidReceipt(a, 2, 111n)).toMatchObject({ cap: usd(300), maxLots: 111n, maxPay: usd(299.7), back: usd(700.3), over: false, valid: true });
    // 112 x $2.70 = $302.40: under the $1,000 deposit but over the per-bid limit.
    expect(bidReceipt(a, 2, 112n)).toMatchObject({ over: true, valid: false });
    // A maxNotional above the deposit leaves the deposit as the cap.
    expect(spendCap(auction({ maxNotional: usd(5000) }))).toBe(usd(1000));
  });

  it("offers only amounts strictly under the cap, so MAX never repeats one", () => {
    expect(spendPresets(auction({ deposit: usd(500), maxNotional: usd(500) }), USDC).map((p) => p.key)).toEqual(["100", "250", "max"]);
    expect(spendPresets(auction({ deposit: usd(250), maxNotional: usd(250) }), USDC).map((p) => p.key)).toEqual(["100", "max"]);
    expect(spendPresets(auction({ deposit: usd(50), maxNotional: usd(50) }), USDC)).toEqual([{ key: "max", label: "MAX", spend: usd(50) }]);
    expect(AMOUNT_STEPS).toEqual([100n, 250n, 500n]);
  });

  it("gives no lots when one lot costs more than the amount", () => {
    const a = auction({ minPrice: usd(150) });
    expect(lotsForSpend(a, usd(100), 0)).toBe(0n);
    expect(lotsForSpend(a, usd(250), 0)).toBe(1n);
  });

  it("counts packs when one lot is not one whole token", () => {
    const packs = auction({ lotSize: 1000n * E18 });
    expect(wholeLots(packs, NCAT)).toBe(false);
    const lots = lotsForSpend(packs, usd(500), 2); // $2.70 per pack of 1,000
    expect(lots).toBe(185n);
    const r = bidReceipt(packs, 2, lots);
    expect(r.tokens).toBe(185_000n * E18);
    expect(r.maxPay).toBe(usd(499.5));
    expect(tokensText(packs, lots)).toBe("185,000 NCAT");

    const halves = auction({ lotSize: E18 / 2n });
    expect(wholeLots(halves, NCAT)).toBe(false);
    expect(bidReceipt(halves, 0, 3n).tokens).toBe((3n * E18) / 2n);
    expect(tokensText(halves, 3n)).toBe("1.5 NCAT");
  });

  it("works for 6-decimal sale tokens and 18-decimal quote tokens", () => {
    const a = auction({ sale: TKN6, quote: USDM, lotSize: 10n ** 6n, deposit: 1000n * E18, maxNotional: 1000n * E18, minPrice: (25n * E18) / 10n, stepSize: E18 / 10n });
    expect(wholeLots(a, TKN6)).toBe(true);
    const presets = spendPresets(a, USDM);
    expect(presets.map((p) => p.spend)).toEqual([100n * E18, 250n * E18, 500n * E18, 1000n * E18]);
    expect(presets.map((p) => p.label)).toEqual(["$100", "$250", "$500", "MAX"]);
    const lots = lotsForSpend(a, 500n * E18, 2);
    expect(lots).toBe(185n);
    const r = bidReceipt(a, 2, lots);
    expect(r.tokens).toBe(185n * 10n ** 6n);
    expect(r.maxPay).toBe((4995n * E18) / 10n);
    expect(r.back).toBe((5005n * E18) / 10n);
    expect(moneyText(r.maxPay, USDM)).toBe("$499.50");
    expect(moneyText(r.back, USDM)).toBe("$500.50");
    expect(tokensText(a, lots)).toBe("185 TKN");
  });

  it("labels amounts without a dollar sign for other quote tokens", () => {
    const a = auction({ quote: WMON, deposit: 1000n * E18, maxNotional: 1000n * E18, minPrice: (25n * E18) / 10n, stepSize: E18 / 10n });
    expect(spendPresets(a, WMON).map((p) => p.label)).toEqual(["100", "250", "500", "MAX"]);
    const r = bidReceipt(a, 2, lotsForSpend(a, 500n * E18, 2));
    expect(moneyText(r.maxPay, WMON)).toBe("499.5 WMON");
    expect(moneyText(r.back, WMON)).toBe("500.5 WMON");
  });

  it("treats empty and zero amounts as nothing to bid, and flags amounts over the limit", () => {
    const a = auction();
    for (const text of ["", "0", "abc"]) {
      const lots = lotsOf(cleanLots(text));
      expect(lots).toBe(0n);
      expect(bidReceipt(a, 2, lots)).toMatchObject({ maxPay: 0n, back: usd(1000), tokens: 0n, over: false, valid: false });
    }
    const huge = lotsOf(cleanLots("99,999,999,999,999,999,999"));
    expect(huge).toBe(99_999_999_999_999_999_999n);
    expect(bidReceipt(a, 2, huge)).toMatchObject({ over: true, valid: false });
    expect(bidReceipt(a, 2, 371n)).toMatchObject({ over: true, valid: false });
    expect(bidReceipt(a, 5, 1n)).toMatchObject({ price: usd(3), maxPay: usd(3), over: false, valid: true });
  });

  it("reads typed amounts as whole lots", () => {
    expect(cleanLots("12.5")).toBe("12");
    expect(cleanLots("1,000")).toBe("1000");
    expect(cleanLots("1 000_000")).toBe("1000000");
    expect(cleanLots("007")).toBe("7");
    expect(cleanLots("000")).toBe("0");
    expect(cleanLots(".5")).toBe("");
    expect(cleanLots("12abc")).toBe("12");
    expect(lotsOf("12")).toBe(12n);
    expect(lotsOf("")).toBe(0n);
    expect(lotsOf("1.5")).toBe(0n);
  });
});

/* ---------- what a bid got (mirrors BlindAuctionV2._allocation / _refundOf / _tokensOf) ---------- */

function bid(patch: Partial<BidView> = {}): BidView {
  return {
    bidder: getAddress("0x00000000000000000000000000000000000000d5"),
    opened: true,
    counted: true,
    forfeited: false,
    refundClaimed: false,
    tokensClaimed: false,
    step: 0,
    quantity: 0n,
    prefix: 0n,
    slot: 0,
    ...patch,
  } as BidView;
}

/** Settled at $2.70 (step 2): 900 lots went above it, 100 left for 300 lots asked at $2.70, so pro rata. */
const settled = (patch: Partial<AuctionView> = {}) =>
  auction({ status: STATUS.Settled, clearingStep: 2, clearingPrice: usd(2.7), aboveTotal: 900n, remaining: 100n, atDemand: 300n, totalSold: 1000n, ...patch });

describe("lootOf", () => {
  it("won in full: above the final price, every lot at the one final price", () => {
    const loot = lootOf(settled(), bid({ step: 4, quantity: 185n }));
    expect(loot).toEqual({ kind: "won", tokens: 185n * E18, asked: 185n * E18, paid: usd(499.5), back: usd(500.5), max: usd(2.9), uncounted: false, percent: 100 });
    expect(money(loot.paid, USDC)).toBe("$499.50");
  });

  it("won in full at the final price when that step was not oversubscribed", () => {
    const loot = lootOf(settled({ atDemand: 80n, remaining: 100n, totalSold: 980n }), bid({ step: 2, quantity: 80n }));
    expect(loot).toMatchObject({ kind: "won", tokens: 80n * E18, paid: usd(216), back: usd(784), percent: 100 });
  });

  it("fair share at the final price: floor(rem*(prefix+q)/D) - floor(rem*prefix/D)", () => {
    // 100 * 250 / 300 = 83, 100 * 100 / 300 = 33 -> 50 of 150.
    const loot = lootOf(settled(), bid({ step: 2, quantity: 150n, prefix: 100n }));
    expect(loot).toEqual({ kind: "fair", tokens: 50n * E18, asked: 150n * E18, paid: usd(135), back: usd(865), max: usd(2.7), uncounted: false, percent: 33 });
  });

  it("fair shares at the final price add up to exactly what was left", () => {
    const a = settled();
    const sizes = [100n, 150n, 50n];
    let prefix = 0n;
    let total = 0n;
    for (const quantity of sizes) {
      const loot = lootOf(a, bid({ step: 2, quantity, prefix }));
      expect(loot.tokens / E18).toBeLessThanOrEqual(quantity);
      total += loot.tokens / E18;
      prefix += quantity;
    }
    expect(total).toBe(a.remaining);
    expect(outcomeOf(a).proRata).toBe(true);
    expect(outcomeOf(settled({ atDemand: 100n })).proRata).toBe(false);
  });

  it("missed: a step below the final price gets nothing and all the money back", () => {
    const loot = lootOf(settled(), bid({ step: 1, quantity: 185n }));
    expect(loot).toEqual({ kind: "missed", tokens: 0n, asked: 185n * E18, paid: 0n, back: usd(1000), max: usd(2.6), uncounted: false, percent: 0 });
  });

  it("a fair share that rounds down to zero lots reads as crowded out, never as priced out", () => {
    // 1 * 1 / 3 rounds to 0: the contract gives 0 lots and a full refund, but the bid was at the final price.
    const a = settled({ remaining: 1n, atDemand: 3n });
    const loot = lootOf(a, bid({ step: 2, quantity: 1n, prefix: 0n }));
    expect(loot).toMatchObject({ kind: "fair", tokens: 0n, back: usd(1000) });
    expect(loot.max).toBe(a.clearingPrice);
  });

  it("not counted: full refund, flagged as uncounted", () => {
    const loot = lootOf(settled(), bid({ step: 4, quantity: 185n, counted: false }));
    expect(loot).toEqual({ kind: "refund", tokens: 0n, asked: 185n * E18, paid: 0n, back: usd(1000), max: usd(2.9), uncounted: true, percent: 0 });
  });

  it("forfeited: the deposit is gone and nothing is bought", () => {
    const loot = lootOf(settled(), bid({ step: 4, quantity: 185n, counted: false, forfeited: true }));
    expect(loot).toMatchObject({ kind: "burned", tokens: 0n, paid: 0n, back: 0n, uncounted: false });
  });

  it("cancelled: the whole deposit comes back, even for a bid that would have won or was forfeited", () => {
    const a = auction({ status: STATUS.Cancelled });
    expect(lootOf(a, bid({ step: 4, quantity: 185n }))).toEqual({ kind: "refund", tokens: 0n, asked: 185n * E18, paid: 0n, back: usd(1000), max: usd(2.9), uncounted: false, percent: 0 });
    expect(lootOf(a, bid({ step: 4, quantity: 185n, forfeited: true }))).toMatchObject({ kind: "refund", back: usd(1000) });
  });

  it("uses lotSize for tokens when one lot is a pack", () => {
    const loot = lootOf(settled({ lotSize: 1000n * E18 }), bid({ step: 2, quantity: 150n, prefix: 100n }));
    expect(loot).toMatchObject({ kind: "fair", tokens: 50_000n * E18, asked: 150_000n * E18, paid: usd(135) });
  });
});

/* ---------- number formats ---------- */

describe("moneyText", () => {
  it("writes dollar quotes with a $ and two decimals, rounded down, with separators", () => {
    expect(moneyText(usd(500), USDC)).toBe("$500.00");
    expect(moneyText(1_234_567_890n, USDC)).toBe("$1,234.56");
    expect(moneyText(1_234_567_890n, USDC, false)).toBe("$1,234");
    expect(moneyText(usd(1_000_000), USDC, false)).toBe("$1,000,000");
    expect(moneyText(0n, USDC)).toBe("$0.00");
    expect(moneyText((4995n * E18) / 10n, USDM)).toBe("$499.50");
  });

  it("treats any symbol containing USD as dollars, ignoring case", () => {
    for (const symbol of ["USDC", "USDT", "AUSD", "usdm"]) expect(moneyText(usd(2.5), { ...USDC, symbol })).toBe("$2.50");
  });

  it("writes other quotes as an amount and the symbol, up to four decimals", () => {
    expect(moneyText(1234n * E18 + 567_891_234n * 10n ** 9n, WMON)).toBe("1,234.5678 WMON");
    expect(moneyText(500n * E18, WMON)).toBe("500 WMON");
    expect(moneyText(1234n * E18 + E18 / 2n, WMON, false)).toBe("1,234 WMON");
  });
});

describe("priceText", () => {
  it("uses as many decimals as the price options need, at least two for dollars", () => {
    const a = auction();
    expect(priceText(a, usd(2.7))).toBe("$2.70");
    expect(priceText(a, usd(1234.5))).toBe("$1,234.50");
    const cents = auction({ minPrice: 12_000n, stepSize: 1_000n });
    expect(priceText(cents, 16_000n)).toBe("$0.016");
  });

  it("caps at six decimals, rounding down", () => {
    const fine = auction({ quote: USDM, minPrice: 1n, stepSize: 1n });
    expect(priceText(fine, 1_234_567_891_234_567_891n)).toBe("$1.234567");
  });

  it("writes other quotes with the symbol and no forced decimals", () => {
    const quarters = auction({ quote: WMON, minPrice: E18 / 2n, stepSize: E18 / 4n });
    expect(priceText(quarters, (3n * E18) / 4n)).toBe("0.75 WMON");
    expect(priceText(quarters, E18)).toBe("1.00 WMON");
    const whole = auction({ quote: WMON, minPrice: 3n * E18, stepSize: E18 });
    expect(priceText(whole, 1234n * E18)).toBe("1,234 WMON");
  });
});

describe("tokensText and wholeLots", () => {
  it("multiplies lots by the lot size and groups thousands", () => {
    expect(tokensText(auction(), 25_000n)).toBe("25,000 NCAT");
    expect(tokensText(auction({ lotSize: 1000n * E18 }), 25n)).toBe("25,000 NCAT");
    expect(tokensText(auction({ sale: TKN6, lotSize: 10n ** 6n }), 1_234_567n)).toBe("1,234,567 TKN");
  });

  it("knows when one lot is one whole token", () => {
    expect(wholeLots({ lotSize: E18 }, NCAT)).toBe(true);
    expect(wholeLots({ lotSize: 10n ** 6n }, TKN6)).toBe(true);
    expect(wholeLots({ lotSize: E18 }, TKN6)).toBe(false);
    expect(wholeLots({ lotSize: 1000n * E18 }, NCAT)).toBe(false);
  });
});

describe("trackerOf", () => {
  it("puts every phase on the right stage", () => {
    const expected: Record<Phase, ReturnType<typeof trackerOf>> = {
      scheduled: { now: "bid", bad: false, done: false },
      bidding: { now: "bid", bad: false, done: false },
      awaitingKeys: { now: "unlock", bad: false, done: false },
      opening: { now: "unlock", bad: false, done: false },
      ready: { now: "result", bad: false, done: false },
      cancellable: { now: "unlock", bad: true, done: false },
      settled: { now: "result", bad: false, done: true },
      cancelled: { now: "unlock", bad: true, done: false },
    };
    for (const phase of Object.keys(expected) as Phase[]) expect(trackerOf(phase), phase).toEqual(expected[phase]);
  });
});
